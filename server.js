const path = require('path');
const fs = require('fs');
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

// Middlewares
app.use(helmet());
app.use(express.json());
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

app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, accountType, certificateProvided } = req.body;

        if (!name || !email || !password || !accountType) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const hashedPassword = await bcrypt.hash(password, 10);

        const insert = db.prepare(
            `INSERT INTO users (name, email, password_hash, account_type, certificate_uploaded)
             VALUES (?, ?, ?, ?, ?)`
        );

        insert.run(name.trim(), normalizedEmail, hashedPassword, accountType, certificateProvided ? 1 : 0);

        return res.status(201).json({ message: 'Usuario registrado correctamente.' });
    } catch (error) {
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
        const user = db.prepare(`SELECT id, name, email, account_type, created_at FROM users WHERE id = ?`).get(
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

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'pages', 'paginainicio.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
