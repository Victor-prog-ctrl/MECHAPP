const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const helmet = require('helmet');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 3000;
const app = express();

// Database setup
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'app.db');
const db = new Database(dbPath);
const fsp = fs.promises;

db.pragma('journal_mode = WAL');

db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        account_type TEXT NOT NULL,
        certificate_uploaded INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
`).run();

function ensureCertificateStatusColumn() {
  const columns = db.prepare(`PRAGMA table_info(users)`).all();
  const hasCertificateStatus = columns.some((column) => column.name === 'certificate_status');

  if (!hasCertificateStatus) {
    db.prepare(
      `ALTER TABLE users ADD COLUMN certificate_status TEXT NOT NULL DEFAULT 'pendiente'`
    ).run();
  }
}

function ensureCertificatePathColumn() {
  const columns = db.prepare(`PRAGMA table_info(users)`).all();
  const hasCertificatePath = columns.some((column) => column.name === 'certificate_path');

  if (!hasCertificatePath) {
    db.prepare(`ALTER TABLE users ADD COLUMN certificate_path TEXT`).run();
  }
}

ensureCertificateStatusColumn();
ensureCertificatePathColumn();

const certificatesDir = path.join(dataDir, 'certificates');
fs.mkdirSync(certificatesDir, { recursive: true });
const certificatesDirNormalized = path.normalize(certificatesDir + path.sep);

const MAX_CERTIFICATE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_CERTIFICATE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/jpg', 'jpg'],
]);

function parseCertificateDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('Certificado no válido.');
  }

  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);

  if (!matches) {
    throw new Error('Formato de certificado no soportado.');
  }

  const mimeType = matches[1];
  const base64Data = matches[2];

  if (!ALLOWED_CERTIFICATE_TYPES.has(mimeType)) {
    throw new Error('Solo se aceptan certificados en formato JPG o PNG.');
  }

  const buffer = Buffer.from(base64Data, 'base64');

  if (buffer.length > MAX_CERTIFICATE_SIZE) {
    throw new Error('El certificado excede el tamaño máximo permitido (5MB).');
  }

  const extension = ALLOWED_CERTIFICATE_TYPES.get(mimeType);
  return { buffer, extension };
}

async function storeCertificateFile({ dataUrl }, identifier) {
  const { buffer, extension } = parseCertificateDataUrl(dataUrl);
  const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const safeIdentifier = String(identifier || 'cert').replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `${safeIdentifier}-${uniqueSuffix}.${extension}`;
  const relativePath = path.join('certificates', filename);
  const absolutePath = path.join(dataDir, relativePath);

  await fsp.writeFile(absolutePath, buffer);
  return relativePath;
}

// ===== Middlewares =====


app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      // No fuerces HTTPS en dev
      "upgrade-insecure-requests": null,
      "block-all-mixed-content": null,

      "default-src": ["'self'"],

      // ✅ Scripts permitidos (añadimos Google Maps)
      "script-src": [
        "'self'",
        "'unsafe-inline'",
        "https://unpkg.com",
        "https://cdn.jsdelivr.net",
        "https://maps.googleapis.com",
        "https://maps.gstatic.com"
      ],

      // ✅ Estilos (Maps usa gstatic para CSS internos)
      "style-src": [
        "'self'",
        "'unsafe-inline'",
        "https://unpkg.com",
        "https://fonts.googleapis.com",
        "https://maps.gstatic.com"
      ],

      // ✅ Imágenes (incluye sprites/tiles de Google)
      "img-src": [
        "'self'",
        "data:",
        "https://unpkg.com",
        "https://*.tile.openstreetmap.org",
        "https://*.openstreetmap.org",
        "https://maps.googleapis.com",
        "https://maps.gstatic.com"
      ],

      // ✅ Fuentes
      "font-src": [
        "'self'",
        "https://fonts.gstatic.com"
      ],

      // ✅ XHR/Fetch (Google Maps + EmailJS + unpkg)
      "connect-src": [
        "'self'",
        "https://unpkg.com",
        "https://api.emailjs.com",
        "https://maps.googleapis.com"
      ],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
}));


app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.db', dir: dataDir }),
    secret: process.env.SESSION_SECRET || 'mechapp-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);
app.use(morgan('dev'));

// Static files
app.use('/Styles', express.static(path.join(__dirname, 'Styles')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/src', express.static(path.join(__dirname, 'src')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/data', express.static(path.join(__dirname, 'public', 'data')));
app.use('/', express.static(path.join(__dirname, 'pages')));

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

function requireAdmin(req, res, next) {
  try {
    const user = db.prepare(`SELECT account_type FROM users WHERE id = ?`).get(req.session.userId);

    if (!user || user.account_type !== 'admin') {
      return res.status(403).json({ error: 'Acceso restringido para administradores.' });
    }

    next();
  } catch (error) {
    console.error('Error verificando privilegios de administrador', error);
    res.status(500).json({ error: 'No se pudieron validar los permisos.' });
  }
}

app.post('/api/register', async (req, res) => {
  let certificatePath = null;
  try {
    const { name, email, password, accountType, certificate, termsAccepted } = req.body;

    if (!name || !email || !password || !accountType) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    if (!termsAccepted) {
      return res.status(400).json({ error: 'Debes aceptar los términos y condiciones para registrarte.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const hashedPassword = await bcrypt.hash(password, 10);

    const isMechanic = accountType === 'mecanico';
    if (isMechanic) {
      if (!certificate || typeof certificate !== 'object') {
        return res.status(400).json({ error: 'Debes adjuntar tu certificado profesional.' });
      }

      try {
        certificatePath = await storeCertificateFile(certificate, normalizedEmail);
      } catch (certificateError) {
        return res.status(400).json({ error: certificateError.message || 'No se pudo guardar el certificado.' });
      }
    }

    const insert = db.prepare(
      `INSERT INTO users (
         name,
         email,
         password_hash,
         account_type,
         certificate_uploaded,
         certificate_status,
         certificate_path
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const certificateUploadedValue = isMechanic && certificatePath ? 1 : 0;
    const certificateStatusValue = isMechanic ? 'pendiente' : 'validado';

    insert.run(
      name.trim(),
      normalizedEmail,
      hashedPassword,
      accountType,
      certificateUploadedValue,
      certificateStatusValue,
      certificatePath
    );

    const successMessage = isMechanic
      ? 'Tu registro se envió correctamente. Un administrador validará tu certificado antes de habilitar tu cuenta.'
      : 'Usuario registrado correctamente. Ya puedes iniciar sesión.';

    return res.status(201).json({ message: successMessage });
  } catch (error) {
    if (certificatePath) {
      try {
        await fsp.unlink(path.join(dataDir, certificatePath));
      } catch (removeError) {
        console.error('No se pudo eliminar el certificado almacenado temporalmente', removeError);
      }
    }

    if (error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'El correo ya está registrado.' });
    }
    console.error('Error registrando usuario', error);
    return res.status(500).json({ error: 'Ocurrió un error al registrar el usuario.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Ingresa correo y contraseña.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(normalizedEmail);

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }

    if (user.account_type === 'mecanico') {
      if (user.certificate_status === 'pendiente') {
        return res.status(403).json({
          error: 'Tu certificado está pendiente de validación. Un administrador debe aprobarlo antes de que puedas iniciar sesión.',
        });
      }

      if (user.certificate_status === 'rechazado') {
        return res.status(403).json({
          error: 'Tu certificado fue rechazado. Comunícate con un administrador para recibir asistencia.',
        });
      }
    }

    req.session.userId = user.id;

    res.json({ message: 'Inicio de sesión correcto.' });
  } catch (error) {
    console.error('Error al iniciar sesión', error);
    res.status(500).json({ error: 'Ocurrió un error al iniciar sesión.' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error('Error al cerrar sesión', error);
      return res.status(500).json({ error: 'No se pudo cerrar sesión.' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Sesión finalizada.' });
  });
});

app.get('/api/profile', requireAuth, (req, res) => {
  try {
    const user = db
      .prepare(`SELECT id, name, email, account_type, created_at FROM users WHERE id = ?`)
      .get(
      req.session.userId
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      accountType: user.account_type,
      createdAt: user.created_at,
    });
  } catch (error) {
    console.error('Error obteniendo perfil', error);
    res.status(500).json({ error: 'Ocurrió un error al obtener el perfil.' });
  }
});

app.put('/api/profile/name', requireAuth, (req, res) => {
  try {
    const { name } = req.body;
    const trimmedName = String(name || '').trim();

    if (!trimmedName) {
      return res.status(400).json({ error: 'El nombre no puede estar vacío.' });
    }

    db.prepare(`UPDATE users SET name = ? WHERE id = ?`).run(trimmedName, req.session.userId);

    res.json({ message: 'Nombre actualizado correctamente.' });
  } catch (error) {
    console.error('Error al actualizar el nombre', error);
    res.status(500).json({ error: 'Ocurrió un error al actualizar el nombre.' });
  }
});

app.put('/api/profile/email', requireAuth, (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
    }

    const update = db.prepare(`UPDATE users SET email = ? WHERE id = ?`);

    try {
      update.run(normalizedEmail, req.session.userId);
    } catch (error) {
      if (error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'El correo ya está registrado.' });
      }
      throw error;
    }

    res.json({ message: 'Correo actualizado correctamente.' });
  } catch (error) {
    console.error('Error al actualizar el correo', error);
    res.status(500).json({ error: 'Ocurrió un error al actualizar el correo.' });
  }
});

app.put('/api/profile/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Debes proporcionar la contraseña actual y la nueva contraseña.' });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
    }

    const user = db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(req.session.userId);

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const isMatch = await bcrypt.compare(String(currentPassword), user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: 'La contraseña actual no es correcta.' });
    }

    const hashedPassword = await bcrypt.hash(String(newPassword), 10);

    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hashedPassword, req.session.userId);

    res.json({ message: 'Contraseña actualizada correctamente.' });
  } catch (error) {
    console.error('Error al actualizar la contraseña', error);
    res.status(500).json({ error: 'Ocurrió un error al actualizar la contraseña.' });
  }
});

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  try {
    const users = db
      .prepare(
        `SELECT id, name, email, account_type, certificate_uploaded, certificate_status, created_at
         FROM users
         ORDER BY datetime(created_at) DESC`
      )
      .all();

    res.json({ users });
  } catch (error) {
    console.error('Error obteniendo usuarios para el panel de administración', error);
    res.status(500).json({ error: 'No se pudieron obtener los usuarios.' });
  }
});

app.get('/api/admin/users/:id/certificate-file', requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.id);

  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: 'Identificador de usuario inválido.' });
  }

  try {
    const user = db
      .prepare(`SELECT certificate_path FROM users WHERE id = ?`)
      .get(userId);

    if (!user || !user.certificate_path) {
      return res.status(404).json({ error: 'Certificado no disponible.' });
    }

    const absolutePath = path.join(dataDir, user.certificate_path);
    const normalizedPath = path.normalize(absolutePath);

    if (!normalizedPath.startsWith(certificatesDirNormalized)) {
      return res.status(400).json({ error: 'Ruta de certificado no válida.' });
    }

    if (!fs.existsSync(normalizedPath)) {
      return res.status(404).json({ error: 'Certificado no encontrado.' });
    }

    res.sendFile(normalizedPath);
  } catch (error) {
    console.error('Error al recuperar el certificado', error);
    res.status(500).json({ error: 'No se pudo recuperar el certificado.' });
  }
});

app.put('/api/admin/users/:id/certificate', requireAuth, requireAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { status } = req.body || {};
    const allowedStatuses = ['pendiente', 'validado', 'rechazado'];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Estado de certificado no válido.' });
    }

    const result = db
      .prepare(`UPDATE users SET certificate_status = ? WHERE id = ?`)
      .run(status, userId);

    if (!result.changes) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    res.json({ message: 'Estado del certificado actualizado correctamente.' });
  } catch (error) {
    console.error('Error actualizando el estado del certificado', error);
    res.status(500).json({ error: 'No se pudo actualizar el estado del certificado.' });
  }
});

app.put('/api/admin/users/:id/account-type', requireAuth, requireAdmin, (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { accountType } = req.body || {};
    const allowedAccountTypes = ['cliente', 'mecanico', 'admin'];

    if (!allowedAccountTypes.includes(accountType)) {
      return res.status(400).json({ error: 'Tipo de cuenta no válido.' });
    }

    const result = db.prepare(`UPDATE users SET account_type = ? WHERE id = ?`).run(accountType, userId);

    if (!result.changes) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    res.json({ message: 'Tipo de cuenta actualizado correctamente.' });
  } catch (error) {
    console.error('Error actualizando el tipo de cuenta', error);
    res.status(500).json({ error: 'No se pudo actualizar el tipo de cuenta.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'paginainicio.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
