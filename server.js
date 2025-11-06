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

// ===== fetch polyfill (Node 18+ ya trae fetch; para 16/17 cargamos dinámico) =====
if (typeof fetch !== 'function') {
  global.fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
}

// ====== PayPal (Sandbox) configuración básica ======
const PAYPAL_API_BASE = process.env.PAYPAL_API || 'https://api-m.sandbox.paypal.com';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || 'ATK6vMKNkGN9nrBunM83FLJ8_6rR82v28x35yp7YpKHyajQORbwHoAhjpzmZyy9SDpUGQqf4taf0uNhg';
const PAYPAL_SECRET = process.env.PAYPAL_SECRET || 'EDX3en15c1djJA8af0H_bDoqzysgedMIwwWtig2sa61XKMTaCTpXdqwMeNpWYEo0OTIwd5vAvbhnZHm1';

// Helpers PayPal
async function getPayPalAccessToken() {
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[paypal token] status ${res.status} ${text}`);
  }
  return res.json(); // { access_token, ... }
}

async function getOrderDetails(orderId, accessToken) {
  const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[paypal order] status ${res.status} ${text}`);
  }
  return res.json();
}
// Captura una orden en PayPal y devuelve el JSON de captura
async function capturePayPalOrder(orderId) {
  const { access_token } = await getPayPalAccessToken();
  const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json'
    }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`[paypal capture] status ${res.status} ${JSON.stringify(data)}`);
  }
  return data; // incluye purchase_units[0].payments.captures[0]
}


// =================== Database setup ===================
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

db.prepare(`
    CREATE TABLE IF NOT EXISTS workshops (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        short_description TEXT NOT NULL,
        description TEXT NOT NULL,
        experience_years INTEGER NOT NULL DEFAULT 0,
        address TEXT NOT NULL,
        schedule TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        specialties TEXT NOT NULL,
        services TEXT NOT NULL,
        certifications TEXT NOT NULL,
        photo TEXT NOT NULL,
        owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,              -- 'paypal'
    order_id TEXT NOT NULL UNIQUE,       -- id de la orden (PayPal)
    status TEXT NOT NULL,                -- COMPLETED, etc.
    payer_email TEXT,
    amount_value TEXT,
    amount_currency TEXT,
    raw_json TEXT NOT NULL,              -- respuesta completa PayPal para auditoría
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS workshop_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workshop_id TEXT NOT NULL,
        client_id INTEGER,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        service TEXT NOT NULL,
        visit_type TEXT NOT NULL CHECK (visit_type IN ('taller','domicilio')),
        visit_date TEXT NOT NULL,
        headline TEXT,
        comment TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE,
        FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE SET NULL
    )
`).run();

const WORKSHOP_SEED = [
  {
    id: 'automaster-centro',
    name: 'AutoMasters · Centro',
    shortDescription:
      'Especialistas en mantenimiento integral y diagnósticos electrónicos para flotas urbanas.',
    description:
      'AutoMasters · Centro combina tecnología de diagnóstico de última generación con un equipo certificado para resolver problemas mecánicos complejos y mantenimientos preventivos.',
    services: [
      'Mantenimiento general y preventivo',
      'Diagnóstico electrónico avanzado',
      'Reparación de frenos y suspensión',
      'Preparación para revisión técnica',
    ],
    experienceYears: 12,
    address: "Av. Libertador Bernardo O'Higgins 1234, Santiago",
    schedule: 'Lunes a sábado de 9:00 a 19:00 hrs',
    phone: '+56 2 2345 6789',
    email: 'contacto@automastercentro.cl',
    certifications: ['Bosch Service Partner', 'ISO 9001 Talleres'],
    photo: '../assets/mantenimiento-generalf-Photoroom.png',
    specialties: ['Mantenimiento general', 'Diagnóstico electrónico', 'Frenos'],
  },
  {
    id: 'taller-ruiz',
    name: 'Taller Ruiz',
    shortDescription: 'Alineación, balanceo y servicios de suspensión con equipamiento de precisión.',
    description:
      'Taller Ruiz es reconocido por su servicio ágil y por acompañar a conductores particulares y flotas en trabajos de suspensión, dirección y neumáticos.',
    services: [
      'Alineación y balanceo computarizado',
      'Reparación de suspensión y dirección',
      'Cambio y rotación de neumáticos',
      'Diagnóstico de vibraciones en carretera',
    ],
    experienceYears: 9,
    address: 'Av. Providencia 1456, Providencia',
    schedule: 'Lunes a viernes de 8:30 a 18:30 hrs',
    phone: '+56 2 2765 9012',
    email: 'contacto@tallerruiz.cl',
    certifications: ['Hunter Elite Alignment', 'Socio Red Neumáticos Chile'],
    photo: '../assets/aliniacion-Photoroom.png',
    specialties: ['Alineación', 'Suspensión', 'Neumáticos'],
  },
  {
    id: 'electroauto-norte',
    name: 'ElectroAuto Norte',
    shortDescription: 'Diagnóstico eléctrico, baterías inteligentes e inyección electrónica.',
    description:
      'ElectroAuto Norte atiende vehículos híbridos y convencionales con especialistas en electrónica automotriz, ofreciendo soluciones rápidas y garantizadas.',
    services: [
      'Diagnóstico eléctrico y electrónico',
      'Reparación de sistemas de carga e iluminación',
      'Mantención de baterías de litio e híbridas',
      'Programación de módulos y sensores',
    ],
    experienceYears: 11,
    address: 'Av. Recoleta 2888, Recoleta',
    schedule: 'Lunes a sábado de 9:30 a 18:30 hrs',
    phone: '+56 2 2890 1122',
    email: 'hola@electroautonorte.cl',
    certifications: ['Especialistas ASE Eléctrico', 'Autel Elite Workshop'],
    photo: '../assets/transparent-Photoroom.png',
    specialties: ['Diagnóstico eléctrico', 'Híbridos', 'Baterías'],
  },
  {
    id: 'torque-sur',
    name: 'Torque Sur',
    shortDescription: 'Servicios rápidos de frenos, cambios de aceite y asistencia en ruta.',
    description:
      'Torque Sur entrega soluciones exprés con repuestos certificados, asistencia a domicilio y seguimiento digital del historial del vehículo.',
    services: [
      'Cambio de aceite y filtros',
      'Servicio de frenos completos',
      'Atención en ruta dentro de la comuna',
      'Diagnóstico de motores gasolina y diésel',
    ],
    experienceYears: 7,
    address: 'Gran Avenida José Miguel Carrera 7200, San Miguel',
    schedule: 'Lunes a domingo de 10:00 a 19:30 hrs',
    phone: '+56 9 9988 7766',
    email: 'servicio@torquesur.cl',
    certifications: ['Mobil Service Center', 'Certificado SEC'],
    photo: '../assets/logo-oscuro.png',
    specialties: ['Frenos', 'Lubricación', 'Asistencia en ruta'],
  },
];

function seedWorkshops() {
  const existing = db.prepare(`SELECT COUNT(*) as count FROM workshops`).get();
  if (existing?.count) {
    return;
  }

  const insert = db.prepare(`
    INSERT INTO workshops (
      id,
      name,
      short_description,
      description,
      experience_years,
      address,
      schedule,
      phone,
      email,
      specialties,
      services,
      certifications,
      photo,
      owner_id
    )
    VALUES (@id, @name, @shortDescription, @description, @experienceYears, @address, @schedule, @phone, @email, @specialties, @services, @certifications, @photo, @ownerId)
  `);

  const insertMany = db.transaction((records) => {
    for (const record of records) {
      insert.run({
        id: record.id,
        name: record.name,
        shortDescription: record.shortDescription,
        description: record.description,
        experienceYears: record.experienceYears,
        address: record.address,
        schedule: record.schedule,
        phone: record.phone,
        email: record.email,
        specialties: JSON.stringify(record.specialties),
        services: JSON.stringify(record.services),
        certifications: JSON.stringify(record.certifications),
        photo: record.photo,
        ownerId: null,
      });
    }
  });

  insertMany(WORKSHOP_SEED);
}

seedWorkshops();

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('No se pudo analizar la columna JSON', error);
    return [];
  }
}

function normalizeAverage(value, count) {
  if (!count || value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number(numeric.toFixed(1));
}

function getMechanicWorkshopSummary(mechanicId) {
  if (!mechanicId) return null;

  const row = db
    .prepare(
      `SELECT
         w.id,
         w.name,
         COUNT(r.id) AS reviews_count,
         AVG(r.rating) AS average_rating
       FROM workshops w
       LEFT JOIN workshop_reviews r ON r.workshop_id = w.id
       WHERE w.owner_id = ?
       GROUP BY w.id
       ORDER BY reviews_count DESC, w.rowid DESC
       LIMIT 1`
    )
    .get(mechanicId);

  if (!row) return null;

  const reviewsCount = Number(row.reviews_count || 0);

  return {
    id: row.id,
    name: row.name,
    reviewsCount,
    averageRating: normalizeAverage(row.average_rating, reviewsCount),
  };
}

function getMechanicAppointmentsSummary(mechanicId) {
  if (!mechanicId) {
    return {
      completedAppointmentsLast12Months: 0,
      completedAppointmentsTotal: 0,
    };
  }

  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'completado' AND datetime(scheduled_for) >= datetime('now', '-12 months') THEN 1 ELSE 0 END) AS completed_last_12_months,
         SUM(CASE WHEN status = 'completado' THEN 1 ELSE 0 END) AS completed_total
       FROM appointments
       WHERE mechanic_id = ?`
    )
    .get(mechanicId);

  const completedLast12Months = Number(row?.completed_last_12_months) || 0;
  const completedTotal = Number(row?.completed_total) || 0;

  return {
    completedAppointmentsLast12Months: completedLast12Months,
    completedAppointmentsTotal: completedTotal,
  };
}

function mapWorkshopSummary(row) {
  const reviewsCount = Number(row.reviews_count || 0);
  const averageRating = normalizeAverage(row.average_rating, reviewsCount);

  return {
    id: row.id,
    name: row.name,
    shortDescription: row.short_description,
    specialties: parseJsonArray(row.specialties),
    services: parseJsonArray(row.services),
    photo: row.photo,
    experienceYears: Number(row.experience_years || 0),
    averageRating,
    reviewsCount,
    latestReview:
      row.latest_comment && row.latest_rating
        ? {
            rating: Number(row.latest_rating),
            comment: row.latest_comment,
            headline: row.latest_headline || null,
            service: row.latest_service || null,
            visitDate: row.latest_visit_date || null,
            visitType: row.latest_visit_type || null,
            createdAt: row.latest_created_at,
            clientName: row.latest_client_name || 'Cliente verificado',
          }
        : null,
  };
}

function mapWorkshopDetail(row) {
  const summary = mapWorkshopSummary(row);

  return {
    ...summary,
    description: row.description,
    services: parseJsonArray(row.services),
    certifications: parseJsonArray(row.certifications),
    address: row.address,
    schedule: row.schedule,
    phone: row.phone,
    email: row.email,
  };
}

const WORKSHOP_WITH_STATS_QUERY = `
  WITH review_stats AS (
    SELECT
      workshop_id,
      COUNT(*) AS reviews_count,
      AVG(rating) AS average_rating
    FROM workshop_reviews
    GROUP BY workshop_id
  ),
  latest_reviews AS (
    SELECT
      r.id,
      r.workshop_id,
      r.rating,
      r.comment,
      r.headline,
      r.service,
      r.visit_date,
      r.visit_type,
      r.created_at,
      COALESCE(u.name, 'Cliente verificado') AS latest_client_name,
      ROW_NUMBER() OVER (PARTITION BY r.workshop_id ORDER BY datetime(r.created_at) DESC) AS row_number
    FROM workshop_reviews r
    LEFT JOIN users u ON u.id = r.client_id
  )
  SELECT
    w.id,
    w.name,
    w.short_description,
    w.description,
    w.experience_years,
    w.address,
    w.schedule,
    w.phone,
    w.email,
    w.specialties,
    w.services,
    w.certifications,
    w.photo,
    COALESCE(rs.reviews_count, 0) AS reviews_count,
    rs.average_rating,
    lr.rating AS latest_rating,
    lr.comment AS latest_comment,
    lr.headline AS latest_headline,
    lr.service AS latest_service,
    lr.visit_date AS latest_visit_date,
    lr.visit_type AS latest_visit_type,
    lr.created_at AS latest_created_at,
    lr.latest_client_name AS latest_client_name
  FROM workshops w
  LEFT JOIN review_stats rs ON rs.workshop_id = w.id
  LEFT JOIN latest_reviews lr ON lr.workshop_id = w.id AND lr.row_number = 1
`;

function computeWorkshopStats(rows) {
  const specialtySet = new Set();
  for (const row of rows) {
    for (const specialty of parseJsonArray(row.specialties)) {
      specialtySet.add(specialty);
    }
  }

  const global = db
    .prepare(
      `SELECT AVG(rating) AS average_rating, COUNT(*) AS total_reviews, COUNT(DISTINCT client_id) AS verified_clients FROM workshop_reviews`
    )
    .get();

  const totalReviews = Number(global?.total_reviews || 0);

  return {
    totalWorkshops: rows.length,
    totalReviews,
    averageRating: normalizeAverage(global?.average_rating, totalReviews),
    verifiedClients: Number(global?.verified_clients || 0),
    uniqueSpecialties: specialtySet.size,
  };
}

function mapReviewRow(row) {
  return {
    id: row.id,
    workshopId: row.workshop_id,
    rating: Number(row.rating),
    service: row.service,
    visitType: row.visit_type,
    visitDate: row.visit_date,
    headline: row.headline || null,
    comment: row.comment,
    createdAt: row.created_at,
    clientName: row.client_name || 'Cliente verificado',
  };
}

const CLIENT_HISTORY_QUERY = `
  WITH latest_workshops AS (
    SELECT
      owner_id,
      id AS workshop_id,
      name AS workshop_name,
      address AS workshop_address,
      photo AS workshop_photo
    FROM (
      SELECT *,
             ROW_NUMBER() OVER (PARTITION BY owner_id ORDER BY rowid DESC) AS row_number
      FROM workshops
    )
    WHERE row_number = 1
  )
  SELECT
    a.id,
    a.service,
    a.visit_type,
    a.scheduled_for,
    COALESCE(a.status, 'pendiente') AS status,
    a.address,
    a.created_at,
    a.mechanic_id,
    lw.workshop_id,
    lw.workshop_name,
    lw.workshop_address,
    lw.workshop_photo,
    m.name AS mechanic_name,
    m.email AS mechanic_email
  FROM appointments a
  LEFT JOIN latest_workshops lw ON lw.owner_id = a.mechanic_id
  LEFT JOIN users m ON m.id = a.mechanic_id
  WHERE a.client_id = ?
  ORDER BY datetime(a.scheduled_for) DESC, a.id DESC
`;

function mapAppointmentHistoryRow(row) {
  if (!row) return null;

  const mechanicId = Number(row.mechanic_id);
  const hasMechanic = Number.isInteger(mechanicId) && mechanicId > 0;

  return {
    id: Number(row.id),
    service: row.service,
    visitType: row.visit_type,
    scheduledFor: row.scheduled_for,
    status: row.status || 'pendiente',
    address: row.address || null,
    createdAt: row.created_at,
    mechanic: hasMechanic
      ? {
          id: mechanicId,
          name: row.mechanic_name || null,
          email: row.mechanic_email || null,
        }
      : null,
    workshop: row.workshop_id
      ? {
          id: row.workshop_id,
          name: row.workshop_name || null,
          address: row.workshop_address || null,
          photo: row.workshop_photo || null,
        }
      : null,
  };
}

function getClientAppointmentHistory(clientId) {
  if (!clientId) return [];
  const rows = db.prepare(CLIENT_HISTORY_QUERY).all(clientId);
  return rows.map(mapAppointmentHistoryRow).filter(Boolean);
}

function normalizeTextList(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(/[,\n]/).map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

function createWorkshopSlug(name) {
  const baseSlug = String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'taller';

  let slug = baseSlug;
  let counter = 1;

  while (db.prepare(`SELECT 1 FROM workshops WHERE id = ?`).get(slug)) {
    slug = `${baseSlug}-${counter++}`;
  }
  return slug;
}

function createShortDescription(description) {
  const text = String(description || '').trim();
  if (!text) return 'Taller registrado en Mechapp.';
  if (text.length <= 160) return text;
  const truncated = text.slice(0, 157).replace(/[\s,;:.-]+$/g, '').trim();
  return `${truncated}…`;
}

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

function ensureWorkshopOwnerColumn() {
  const columns = db.prepare(`PRAGMA table_info(workshops)`).all();
  const hasOwnerId = columns.some((column) => column.name === 'owner_id');
  if (!hasOwnerId) {
    db.prepare(
      `ALTER TABLE workshops ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL`
    ).run();
  }
}
ensureWorkshopOwnerColumn();

function ensureAppointmentsTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      mechanic_id INTEGER NOT NULL,
      service TEXT NOT NULL,
      visit_type TEXT NOT NULL CHECK (visit_type IN ('presencial','domicilio')),
      scheduled_for TEXT NOT NULL,
      address TEXT,
      notes TEXT,
      client_latitude REAL,
      client_longitude REAL,
      status TEXT NOT NULL DEFAULT 'pendiente',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id),
      FOREIGN KEY (mechanic_id) REFERENCES users(id)
    )
  `).run();
}
ensureAppointmentsTable();

const certificatesDir = path.join(dataDir, 'certificates');
fs.mkdirSync(certificatesDir, { recursive: true });
const certificatesDirNormalized = path.normalize(certificatesDir + path.sep);

const DEFAULT_ADMIN_NAME = process.env.DEFAULT_ADMIN_NAME || 'Administrador';
const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || 'admin@mechapp.local';
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin123!';

function ensureDefaultAdminAccount() {
  try {
    const existingAdmin = db
      .prepare(`SELECT id FROM users WHERE account_type = 'admin' LIMIT 1`)
      .get();
    if (existingAdmin) return;

    const duplicateEmail = db
      .prepare(`SELECT id FROM users WHERE email = ? LIMIT 1`)
      .get(DEFAULT_ADMIN_EMAIL.trim().toLowerCase());
    if (duplicateEmail) return;

    const passwordHash = bcrypt.hashSync(String(DEFAULT_ADMIN_PASSWORD), 10);

    db.prepare(
      `INSERT INTO users (
         name,
         email,
         password_hash,
         account_type,
         certificate_uploaded,
         certificate_status,
         certificate_path
       )
       VALUES (?, ?, ?, 'admin', 0, 'validado', NULL)`
    ).run(
      String(DEFAULT_ADMIN_NAME).trim() || 'Administrador',
      DEFAULT_ADMIN_EMAIL.trim().toLowerCase(),
      passwordHash
    );

    console.info('Cuenta administradora predeterminada creada:', DEFAULT_ADMIN_EMAIL);
  } catch (error) {
    console.error('No se pudo crear la cuenta administradora predeterminada', error);
  }
}
ensureDefaultAdminAccount();

const MAX_CERTIFICATE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_CERTIFICATE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/jpg', 'jpg'],
]);

const MAX_WORKSHOP_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_WORKSHOP_PHOTO_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/jpg', 'jpg'],
]);

function parseBinaryDataUrl(dataUrl, { allowedTypes, maxSize, fieldLabel }) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error(`Archivo de ${fieldLabel} no válido.`);
  }
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!matches) throw new Error(`Formato de ${fieldLabel} no soportado.`);

  const mimeType = matches[1];
  const base64Data = matches[2];

  if (!allowedTypes.has(mimeType)) {
    throw new Error(`Solo se aceptan archivos en formato JPG o PNG para ${fieldLabel}.`);
  }
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length > maxSize) {
    throw new Error(`El archivo excede el tamaño máximo permitido (5MB).`);
  }

  const extension = allowedTypes.get(mimeType);
  return { buffer, extension };
}

function parseCertificateDataUrl(dataUrl) {
  return parseBinaryDataUrl(dataUrl, {
    allowedTypes: ALLOWED_CERTIFICATE_TYPES,
    maxSize: MAX_CERTIFICATE_SIZE,
    fieldLabel: 'certificado',
  });
}

function parseWorkshopPhotoDataUrl(dataUrl) {
  return parseBinaryDataUrl(dataUrl, {
    allowedTypes: ALLOWED_WORKSHOP_PHOTO_TYPES,
    maxSize: MAX_WORKSHOP_PHOTO_SIZE,
    fieldLabel: 'fotografía del taller',
  });
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

const workshopPhotosDir = path.join(dataDir, 'workshop-photos');
fs.mkdirSync(workshopPhotosDir, { recursive: true });

async function storeWorkshopPhotoFile(dataUrl, identifier) {
  const { buffer, extension } = parseWorkshopPhotoDataUrl(dataUrl);
  const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const safeIdentifier = String(identifier || 'workshop').replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `${safeIdentifier}-${uniqueSuffix}.${extension}`;
  const relativePath = path.join('workshop-photos', filename);
  const absolutePath = path.join(dataDir, relativePath);

  await fsp.writeFile(absolutePath, buffer);
  return `../${relativePath.replace(/\\/g, '/')}`;
}

// ----- BYPASS de seguridad SOLO para agendar-cita.html (test) -----
const noSecurityHeaders = (req, res, next) => {
  // Quitamos headers que rompen el popup/iframe de PayPal SOLO en esta ruta
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('Cross-Origin-Opener-Policy');
  res.removeHeader('Cross-Origin-Embedder-Policy');
  res.removeHeader('Cross-Origin-Resource-Policy');
  res.removeHeader('X-Frame-Options');
  next();
};

// Sirve la página sin Helmet ni CSP para aislar el problema
app.get('/pages/agendar-cita.html', noSecurityHeaders, (req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'agendar-cita.html'));
});

// ===== Middlewares =====
app.use(helmet({
  contentSecurityPolicy: {
    crossOriginEmbedderPolicy: false,
    directives: {
      // Evitar forzar HTTPS en desarrollo
      "upgrade-insecure-requests": null,
      "block-all-mixed-content": null,

      "default-src": ["'self'"],

      // ✅ Scripts: PayPal, Google Maps, Leaflet, EmailJS, etc.
      "script-src": [
        "'self'",
        "'unsafe-inline'",
        "https://www.paypal.com",
        "https://www.paypalobjects.com",
        "https://unpkg.com",
        "https://cdn.jsdelivr.net",
        "https://maps.googleapis.com",
        "https://maps.gstatic.com"
      ],

      "script-src-elem": [
        "'self'",
        "'unsafe-inline'",
        "https://www.paypal.com",
        "https://www.paypalobjects.com",
        "https://unpkg.com",
        "https://cdn.jsdelivr.net",
        "https://maps.googleapis.com",
        "https://maps.gstatic.com"
      ],

      // ✅ iframes: PayPal
      "frame-src": [
        "'self'",
        "https://www.sandbox.paypal.com",
        "https://www.paypal.com",
        "https://*.paypal.com"
      ],
      "child-src": [
        "'self'",
        "https://www.paypal.com",
        "https://*.paypal.com"
      ],

      // ✅ XHR/Fetch: PayPal + Google + EmailJS
      "connect-src": [
        "'self'",
        "https://www.sandbox.paypal.com",
        "https://api-m.sandbox.paypal.com",
        "https://api-m.paypal.com",
        "https://unpkg.com",
        "https://api.emailjs.com",
        "https://maps.googleapis.com"
      ],

      // ✅ Imágenes (incluye PayPal y Maps)
      "img-src": [
        "'self'",
        "data:",
        "https://www.paypalobjects.com",
        "https://*.paypal.com",
        "https://unpkg.com",
        "https://*.tile.openstreetmap.org",
        "https://*.openstreetmap.org",
        "https://maps.googleapis.com",
        "https://maps.gstatic.com",
        "https://images.unsplash.com"
      ],

      // ✅ Estilos (PayPal usa algunos inline)
      "style-src": [
        "'self'",
        "'unsafe-inline'",
        "https://unpkg.com",
        "https://fonts.googleapis.com",
        "https://maps.gstatic.com"
      ],

      // ✅ Fuentes
      "font-src": [
        "'self'",
        "https://fonts.gstatic.com"
      ],

      // Opcional: seguridad de frames
      "frame-ancestors": ["'self'"]
    }
  },
  crossOriginOpenerPolicy: { policy: 'unsafe-none' },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false
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
app.use('/workshop-photos', express.static(workshopPhotosDir));
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

function requireMechanic(req, res, next) {
  try {
    const user = db.prepare(`SELECT account_type FROM users WHERE id = ?`).get(req.session.userId);
    if (!user || user.account_type !== 'mecanico') {
      return res.status(403).json({ error: 'Acceso disponible solo para mecánicos.' });
    }
    next();
  } catch (error) {
    console.error('Error verificando privilegios de mecánico', error);
    res.status(500).json({ error: 'No se pudieron validar los permisos.' });
  }
}

app.get('/api/workshops', (req, res) => {
  try {
    const rows = db.prepare(`${WORKSHOP_WITH_STATS_QUERY} ORDER BY w.name COLLATE NOCASE`).all();
    const workshops = rows.map(mapWorkshopSummary);
    const stats = computeWorkshopStats(rows);

    res.json({ workshops, stats });
  } catch (error) {
    console.error('Error obteniendo talleres', error);
    res.status(500).json({ error: 'No se pudieron obtener los talleres.' });
  }
});

app.get('/api/workshops/:id', (req, res) => {
  const workshopId = String(req.params.id || '').trim();
  if (!workshopId) {
    return res.status(400).json({ error: 'Identificador de taller no válido.' });
  }
  try {
    const row = db.prepare(`${WORKSHOP_WITH_STATS_QUERY} WHERE w.id = ? LIMIT 1`).get(workshopId);
    if (!row) {
      return res.status(404).json({ error: 'Taller no encontrado.' });
    }
    res.json({ workshop: mapWorkshopDetail(row) });
  } catch (error) {
    console.error('Error obteniendo detalles del taller', error);
    res.status(500).json({ error: 'No se pudieron obtener los detalles del taller.' });
  }
});

app.post('/api/workshops', requireAuth, requireMechanic, async (req, res) => {
  try {
    const {
      name,
      description,
      services,
      experienceYears,
      address,
      schedule,
      phone,
      email,
      certifications,
      specialties,
      shortDescription,
      photoDataUrl,
    } = req.body || {};

    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (!normalizedName) {
      return res.status(400).json({ error: 'Ingresa el nombre del taller.' });
    }

    const normalizedDescription = typeof description === 'string' ? description.trim() : '';
    if (!normalizedDescription) {
      return res.status(400).json({ error: 'Describe tu taller para continuar.' });
    }

    const normalizedAddress = typeof address === 'string' ? address.trim() : '';
    if (!normalizedAddress) {
      return res.status(400).json({ error: 'Ingresa la dirección del taller.' });
    }

    const normalizedSchedule = typeof schedule === 'string' && schedule.trim() ? schedule.trim() : 'Horario no especificado';
    const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

    const parsedServices = normalizeTextList(services);
    if (!parsedServices.length) {
      return res.status(400).json({ error: 'Selecciona al menos un servicio destacado.' });
    }
    const parsedCertifications = normalizeTextList(certifications);
    let parsedSpecialties = normalizeTextList(specialties);

    if (!parsedSpecialties.length) {
      parsedSpecialties = parsedServices.slice(0, 5);
    }
    if (!parsedSpecialties.length) {
      parsedSpecialties = ['Servicios generales'];
    }

    const parsedExperience = Number.parseInt(experienceYears, 10);
    const safeExperience = Number.isInteger(parsedExperience) && parsedExperience > 0 ? parsedExperience : 0;

    const slug = createWorkshopSlug(normalizedName);
    const computedShortDescription = createShortDescription(shortDescription || normalizedDescription);

    let photoPath = '../assets/logo-oscuro.png';
    if (photoDataUrl) {
      try {
        photoPath = await storeWorkshopPhotoFile(photoDataUrl, slug);
      } catch (error) {
        console.error('No se pudo almacenar la fotografía del taller', error);
        return res.status(400).json({ error: error.message || 'No se pudo guardar la fotografía del taller.' });
      }
    }

    const insert = db.prepare(
      `INSERT INTO workshops (
        id,
        name,
        short_description,
        description,
        experience_years,
        address,
        schedule,
        phone,
        email,
        specialties,
        services,
        certifications,
        photo,
        owner_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    insert.run(
      slug,
      normalizedName,
      computedShortDescription,
      normalizedDescription,
      safeExperience,
      normalizedAddress,
      normalizedSchedule,
      normalizedPhone || null,
      normalizedEmail || null,
      JSON.stringify(parsedSpecialties),
      JSON.stringify(parsedServices),
      JSON.stringify(parsedCertifications),
      photoPath,
      req.session.userId
    );

    const row = db.prepare(`${WORKSHOP_WITH_STATS_QUERY} WHERE w.id = ? LIMIT 1`).get(slug);
    res.status(201).json({ workshop: row ? mapWorkshopDetail(row) : null });
  } catch (error) {
    console.error('Error registrando taller', error);
    res.status(500).json({ error: 'No se pudo registrar el taller en este momento.' });
  }
});

app.put('/api/workshops/:id', requireAuth, requireMechanic, async (req, res) => {
  const workshopId = String(req.params.id || '').trim();
  if (!workshopId) return res.status(400).json({ error: 'Identificador de taller no válido.' });

  try {
    const existing = db
      .prepare(
        `SELECT id, owner_id, name, short_description, description, experience_years, address, schedule, phone, email, specialties, services, certifications, photo
         FROM workshops
         WHERE id = ?
         LIMIT 1`,
      )
      .get(workshopId);

    if (!existing) return res.status(404).json({ error: 'Taller no encontrado.' });
    if (Number(existing.owner_id) !== Number(req.session.userId)) {
      return res.status(403).json({ error: 'No tienes permisos para editar este taller.' });
    }

    const {
      name,
      shortDescription,
      description,
      services,
      specialties,
      certifications,
      experienceYears,
      address,
      schedule,
      phone,
      email,
      photoDataUrl,
    } = req.body || {};

    const normalizedName = typeof name === 'string' && name.trim() ? name.trim() : existing.name;
    const normalizedDescription = typeof description === 'string' && description.trim()
      ? description.trim()
      : existing.description;
    const computedShortDescription = typeof shortDescription === 'string' && shortDescription.trim()
      ? shortDescription.trim()
      : createShortDescription(normalizedDescription);
    const normalizedAddress = typeof address === 'string' && address.trim() ? address.trim() : existing.address;
    const normalizedSchedule = typeof schedule === 'string' && schedule.trim()
      ? schedule.trim()
      : existing.schedule || 'Horario no especificado';
    const normalizedPhone = typeof phone === 'string' && phone.trim() ? phone.trim() : null;
    const normalizedEmail = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;

    if (!normalizedName) return res.status(400).json({ error: 'Ingresa el nombre del taller.' });
    if (!normalizedDescription) return res.status(400).json({ error: 'Describe tu taller para continuar.' });
    if (!normalizedAddress) return res.status(400).json({ error: 'Ingresa la dirección del taller.' });

    const parsedServices = normalizeTextList(services);
    const existingServices = parseJsonArray(existing.services);
    const servicesToStore = parsedServices.length ? parsedServices : existingServices;
    if (!servicesToStore.length) {
      return res.status(400).json({ error: 'Selecciona al menos un servicio destacado.' });
    }

    const parsedSpecialties = normalizeTextList(specialties);
    let specialtiesToStore = parsedSpecialties.length ? parsedSpecialties : parseJsonArray(existing.specialties);
    if (!specialtiesToStore.length) {
      specialtiesToStore = servicesToStore.slice(0, 5);
    }

    const parsedCertifications = normalizeTextList(certifications);
    const certificationsToStore = parsedCertifications.length
      ? parsedCertifications
      : parseJsonArray(existing.certifications);

    const parsedExperience = Number.parseInt(experienceYears, 10);
    const normalizedExperienceYears = Number.isInteger(parsedExperience) && parsedExperience >= 0
      ? parsedExperience
      : Number(existing.experience_years || 0);

    let photoPath = existing.photo;
    if (photoDataUrl) {
      try {
        photoPath = await storeWorkshopPhotoFile(photoDataUrl, existing.id);
      } catch (error) {
        console.error('No se pudo almacenar la nueva fotografía del taller', error);
        return res.status(400).json({ error: error.message || 'No se pudo guardar la fotografía del taller.' });
      }
    }

    db.prepare(
      `UPDATE workshops
       SET name = ?,
           short_description = ?,
           description = ?,
           experience_years = ?,
           address = ?,
           schedule = ?,
           phone = ?,
           email = ?,
           specialties = ?,
           services = ?,
           certifications = ?,
           photo = ?
       WHERE id = ?`,
    ).run(
      normalizedName,
      computedShortDescription,
      normalizedDescription,
      normalizedExperienceYears,
      normalizedAddress,
      normalizedSchedule,
      normalizedPhone || null,
      normalizedEmail || null,
      JSON.stringify(specialtiesToStore),
      JSON.stringify(servicesToStore),
      JSON.stringify(certificationsToStore),
      photoPath,
      workshopId,
    );

    const row = db.prepare(`${WORKSHOP_WITH_STATS_QUERY} WHERE w.id = ? LIMIT 1`).get(workshopId);
    res.json({
      message: 'Los cambios se guardaron correctamente.',
      workshop: row ? mapWorkshopDetail(row) : null,
    });
  } catch (error) {
    console.error('Error actualizando taller', error);
    res.status(500).json({ error: 'No se pudo actualizar el taller en este momento.' });
  }
});

app.get('/api/workshops/:id/reviews', (req, res) => {
  const workshopId = String(req.params.id || '').trim();
  if (!workshopId) {
    return res.status(400).json({ error: 'Identificador de taller no válido.' });
  }

  const limitParam = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 20;

  try {
    const exists = db.prepare(`SELECT 1 FROM workshops WHERE id = ? LIMIT 1`).get(workshopId);
    if (!exists) return res.status(404).json({ error: 'Taller no encontrado.' });

    const rows = db
      .prepare(
        `SELECT r.id, r.workshop_id, r.rating, r.service, r.visit_type, r.visit_date, r.headline, r.comment, r.created_at, COALESCE(u.name, 'Cliente verificado') AS client_name
         FROM workshop_reviews r
         LEFT JOIN users u ON u.id = r.client_id
         WHERE r.workshop_id = ?
         ORDER BY datetime(r.created_at) DESC
         LIMIT ?`
      )
      .all(workshopId, limit);

    res.json({ reviews: rows.map(mapReviewRow) });
  } catch (error) {
    console.error('Error obteniendo reseñas', error);
    res.status(500).json({ error: 'No se pudieron obtener las reseñas.' });
  }
});

app.post('/api/workshops/:id/reviews', requireAuth, (req, res) => {
  const workshopId = String(req.params.id || '').trim();
  if (!workshopId) {
    return res.status(400).json({ error: 'Identificador de taller no válido.' });
  }

  try {
    const workshop = db.prepare(`SELECT id FROM workshops WHERE id = ?`).get(workshopId);
    if (!workshop) return res.status(404).json({ error: 'El taller seleccionado no existe.' });

    const user = db
      .prepare(`SELECT id, name, account_type FROM users WHERE id = ?`)
      .get(req.session.userId);
    if (!user) return res.status(401).json({ error: 'No autorizado.' });
    if (user.account_type !== 'cliente') {
      return res.status(403).json({ error: 'Solo los clientes pueden publicar reseñas.' });
    }

    const {
      rating,
      service,
      visitType,
      visitDate,
      headline,
      comments,
    } = req.body || {};

    const parsedRating = Number.parseInt(rating, 10);
    if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({ error: 'Selecciona una calificación entre 1 y 5 estrellas.' });
    }

    const normalizedService = typeof service === 'string' ? service.trim() : '';
    if (!normalizedService) {
      return res.status(400).json({ error: 'Describe el servicio que recibiste.' });
    }

    const normalizedVisitType = visitType === 'domicilio' ? 'domicilio' : 'taller';

    const normalizedVisitDate = typeof visitDate === 'string' ? visitDate.trim() : '';
    if (!normalizedVisitDate || !/^\d{4}-\d{2}-\d{2}$/.test(normalizedVisitDate)) {
      return res.status(400).json({ error: 'Ingresa la fecha de la visita en el formato AAAA-MM-DD.' });
    }

    const normalizedHeadline = typeof headline === 'string' ? headline.trim() : '';
    const normalizedComment = typeof comments === 'string' ? comments.trim() : '';
    if (!normalizedComment) {
      return res.status(400).json({ error: 'Comparte tu experiencia con algunos detalles.' });
    }

    const insert = db
      .prepare(
        `INSERT INTO workshop_reviews (workshop_id, client_id, rating, service, visit_type, visit_date, headline, comment)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        workshopId,
        user.id,
        parsedRating,
        normalizedService,
        normalizedVisitType,
        normalizedVisitDate,
        normalizedHeadline || null,
        normalizedComment
      );

    const saved = db
      .prepare(
        `SELECT r.id, r.workshop_id, r.rating, r.service, r.visit_type, r.visit_date, r.headline, r.comment, r.created_at, COALESCE(u.name, 'Cliente verificado') AS client_name
         FROM workshop_reviews r
         LEFT JOIN users u ON u.id = r.client_id
         WHERE r.id = ?`
      )
      .get(insert.lastInsertRowid);

    res.status(201).json({ message: 'Reseña enviada correctamente.', review: mapReviewRow(saved) });
  } catch (error) {
    console.error('Error guardando reseña', error);
    res.status(500).json({ error: 'No se pudo guardar la reseña.' });
  }
});

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
      'INSERT INTO users (name, email, password_hash, account_type, certificate_uploaded, certificate_status, certificate_path) VALUES (?, ?, ?, ?, ?, ?, ?)'
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
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas.' });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Credenciales inválidas.' });

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
    const redirectTo = user.account_type === 'admin' ? '/admin.html' : '/perfil.html';

    res.json({
      message: 'Inicio de sesión correcto.',
      accountType: user.account_type,
      redirectTo,
    });
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

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      accountType: user.account_type,
      createdAt: user.created_at,
      mechanicWorkshop:
        user.account_type === 'mecanico' ? getMechanicWorkshopSummary(user.id) : null,
      mechanicMetrics:
        user.account_type === 'mecanico' ? getMechanicAppointmentsSummary(user.id) : null,
    });
  } catch (error) {
    console.error('Error obteniendo perfil', error);
    res.status(500).json({ error: 'Ocurrió un error al obtener el perfil.' });
  }
});

app.get('/api/profile/history', requireAuth, (req, res) => {
  try {
    const user = db.prepare(`SELECT account_type FROM users WHERE id = ?`).get(req.session.userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
    if (user.account_type !== 'cliente') {
      return res.status(403).json({ error: 'El historial está disponible solo para clientes.' });
    }
    const history = getClientAppointmentHistory(req.session.userId);
    res.json({ history });
  } catch (error) {
    console.error('Error obteniendo historial de visitas', error);
    res.status(500).json({ error: 'No se pudo obtener el historial de visitas.' });
  }
});

app.get('/api/mechanics', requireAuth, (req, res) => {
  try {
    const mechanics = db
      .prepare(
        `SELECT id, name, email
         FROM users
         WHERE account_type = 'mecanico' AND certificate_status = 'validado'
         ORDER BY name COLLATE NOCASE`
      )
      .all();

    res.json({
      mechanics: mechanics.map((mechanic) => ({
        id: mechanic.id,
        name: mechanic.name,
        email: mechanic.email,
      })),
    });
  } catch (error) {
    console.error('Error obteniendo mecánicos disponibles', error);
    res.status(500).json({ error: 'No se pudieron obtener los mecánicos disponibles.' });
  }
});

app.get('/api/appointments/unavailable-days', requireAuth, (req, res) => {
  try {
    const mechanicId = Number.parseInt(req.query.mechanicId, 10);
    if (!Number.isInteger(mechanicId) || mechanicId <= 0) {
      return res.json({ unavailableDays: [] });
    }

    const mechanic = db
      .prepare(
        `SELECT id FROM users WHERE id = ? AND account_type = 'mecanico' AND certificate_status = 'validado'`
      )
      .get(mechanicId);
    if (!mechanic) {
      return res.status(404).json({ error: 'El mecánico seleccionado no está disponible.' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endLimit = new Date(today);
    endLimit.setMonth(endLimit.getMonth() + 6);
    endLimit.setHours(23, 59, 59, 999);

    const formatDate = (value) => {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const start = formatDate(today);
    const end = formatDate(endLimit);

    const rows = db
      .prepare(
        `SELECT DATE(scheduled_for) AS day
         FROM appointments
         WHERE mechanic_id = ?
           AND DATE(scheduled_for) BETWEEN DATE(?) AND DATE(?)
           AND COALESCE(status, 'pendiente') NOT IN ('cancelada', 'rechazada')
         GROUP BY day`
      )
      .all(mechanicId, start, end);

    const unavailableDays = rows
      .map((row) => (typeof row.day === 'string' ? row.day : null))
      .filter((day) => typeof day === 'string');

    res.json({ unavailableDays });
  } catch (error) {
    console.error('Error obteniendo disponibilidad de citas', error);
    res.status(500).json({ error: 'No se pudo obtener la disponibilidad de citas.' });
  }
});

app.post('/api/appointments', requireAuth, (req, res) => {
  try {
    const currentUser = db
      .prepare(`SELECT id, account_type FROM users WHERE id = ?`)
      .get(req.session.userId);
    if (!currentUser) return res.status(401).json({ error: 'No autorizado.' });
    if (currentUser.account_type === 'mecanico') {
      return res.status(403).json({ error: 'Los mecánicos no pueden agendar citas.' });
    }

    const {
      mechanicId,
      service,
      visitType,
      scheduledFor,
      notes,
      address,
      clientLatitude,
      clientLongitude,
    } = req.body;

    const parsedMechanicId = Number.parseInt(mechanicId, 10);
    const normalizedService = typeof service === 'string' ? service.trim() : '';
    const normalizedVisitType = visitType === 'domicilio' ? 'domicilio' : 'presencial';
    const normalizedAddress = typeof address === 'string' ? address.trim() : '';
    const trimmedNotes = typeof notes === 'string' ? notes.trim() : '';

    if (!Number.isInteger(parsedMechanicId) || parsedMechanicId <= 0) {
      return res.status(400).json({ error: 'Selecciona un mecánico válido.' });
    }
    if (!normalizedService) {
      return res.status(400).json({ error: 'Indica el servicio requerido.' });
    }
    if (!scheduledFor || typeof scheduledFor !== 'string') {
      return res.status(400).json({ error: 'Selecciona la fecha y hora de la visita.' });
    }
    const scheduledDate = new Date(scheduledFor);
    if (Number.isNaN(scheduledDate.getTime())) {
      return res.status(400).json({ error: 'La fecha seleccionada no es válida.' });
    }
    if (!normalizedAddress) {
      const message =
        normalizedVisitType === 'domicilio'
          ? 'Indica la dirección para la visita a domicilio.'
          : 'Indica la ubicación del taller para la visita.';
      return res.status(400).json({ error: message });
    }

    const mechanic = db
      .prepare(
        `SELECT id FROM users WHERE id = ? AND account_type = 'mecanico' AND certificate_status = 'validado'`
      )
      .get(parsedMechanicId);
    if (!mechanic) {
      return res.status(404).json({ error: 'El mecánico seleccionado no está disponible.' });
    }

    const parseCoordinate = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const insert = db.prepare(
      `INSERT INTO appointments (
        client_id,
        mechanic_id,
        service,
        visit_type,
        scheduled_for,
        address,
        notes,
        client_latitude,
        client_longitude
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const result = insert.run(
      currentUser.id,
      parsedMechanicId,
      normalizedService,
      normalizedVisitType,
      scheduledDate.toISOString(),
      normalizedAddress,
      trimmedNotes || null,
      parseCoordinate(clientLatitude),
      parseCoordinate(clientLongitude)
    );

    res.status(201).json({
      message: 'Cita agendada correctamente.',
      appointmentId: result.lastInsertRowid,
    });
  } catch (error) {
    console.error('Error al agendar la cita', error);
    res.status(500).json({ error: 'Ocurrió un error al agendar la cita.' });
  }
});

const APPOINTMENT_REQUEST_BASE_QUERY = `
  SELECT
    a.id,
    a.service,
    a.visit_type,
    a.scheduled_for,
    a.address,
    a.notes,
    a.status,
    a.created_at,
    a.client_latitude,
    a.client_longitude,
    u.name AS client_name,
    u.email AS client_email
  FROM appointments a
  JOIN users u ON u.id = a.client_id
`;

function mapAppointmentRequest(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    service: row.service,
    visitType: row.visit_type,
    scheduledFor: row.scheduled_for,
    address: row.address,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    client: {
      name: row.client_name,
      email: row.client_email,
    },
    clientLocation:
      row.client_latitude !== null && row.client_longitude !== null
        ? {
            latitude: row.client_latitude,
            longitude: row.client_longitude,
          }
        : null,
  };
}

app.get('/api/appointments/requests', requireAuth, requireMechanic, (req, res) => {
  try {
    const requests = db
      .prepare(
        `${APPOINTMENT_REQUEST_BASE_QUERY}
        WHERE a.mechanic_id = ?
        ORDER BY datetime(a.scheduled_for) ASC`
      )
      .all(req.session.userId);

    res.json({
      requests: requests.map(mapAppointmentRequest),
    });
  } catch (error) {
    console.error('Error obteniendo solicitudes de citas', error);
    res.status(500).json({ error: 'No se pudieron obtener las solicitudes de citas.' });
  }
});

app.get('/api/appointments/requests/:id', requireAuth, requireMechanic, (req, res) => {
  const requestId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Identificador de solicitud no válido.' });
  }

  try {
    const row = db
      .prepare(
        `${APPOINTMENT_REQUEST_BASE_QUERY}
        WHERE a.id = ? AND a.mechanic_id = ?
        LIMIT 1`
      )
      .get(requestId, req.session.userId);

    if (!row) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }

    res.json({ request: mapAppointmentRequest(row) });
  } catch (error) {
    console.error('Error obteniendo la solicitud de cita', error);
    res.status(500).json({ error: 'No se pudo obtener la solicitud de cita.' });
  }
});

app.patch('/api/appointments/requests/:id', requireAuth, requireMechanic, (req, res) => {
  const requestId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Identificador de solicitud no válido.' });
  }

  const allowedStatuses = new Set(['confirmado', 'rechazado']);
  const requestedStatus = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : '';

  if (!allowedStatuses.has(requestedStatus)) {
    return res.status(400).json({ error: 'Estado de solicitud no válido.' });
  }

  try {
    const existing = db
      .prepare('SELECT status FROM appointments WHERE id = ? AND mechanic_id = ? LIMIT 1')
      .get(requestId, req.session.userId);

    if (!existing) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }

    if (existing.status !== 'pendiente' && existing.status !== requestedStatus) {
      return res.status(400).json({ error: 'Solo puedes actualizar solicitudes pendientes.' });
    }

    if (existing.status !== requestedStatus) {
      db.prepare('UPDATE appointments SET status = ? WHERE id = ? AND mechanic_id = ?')
        .run(requestedStatus, requestId, req.session.userId);
    }

    const updated = db
      .prepare(
        `${APPOINTMENT_REQUEST_BASE_QUERY}
        WHERE a.id = ? AND a.mechanic_id = ?
        LIMIT 1`
      )
      .get(requestId, req.session.userId);

    if (!updated) {
      return res.status(404).json({ error: 'Solicitud no encontrada tras la actualización.' });
    }

    res.json({ request: mapAppointmentRequest(updated) });
  } catch (error) {
    console.error('Error actualizando la solicitud de cita', error);
    res.status(500).json({ error: 'No se pudo actualizar la solicitud de cita.' });
  }
});

// ====== ENDPOINTS PayPal ======
// Confirmar en backend y guardar en BD
// ====== ENDPOINT PayPal: CAPTURAR y guardar ======
app.post('/api/paypal/capture', async (req, res) => {
  try {
    const { orderID } = req.body || {};
    if (!orderID) return res.status(400).json({ error: 'orderID requerido' });

    // 1) Capturar en PayPal (esto hace el cobro real en sandbox)
    const data = await capturePayPalOrder(orderID);

    // 2) Extraer datos útiles
    const pu  = data?.purchase_units?.[0];
    const cap = pu?.payments?.captures?.[0];

    const status   = cap?.status || data?.status || 'COMPLETADO';
    const amount   = cap?.amount?.value || pu?.amount?.value || null;
    const currency = cap?.amount?.currency_code || pu?.amount?.currency_code || null;
    const payerEmail = data?.payer?.email_address || null;

    // 3) Guardar en SQLite (tabla payments ya existe en tu server)
    db.prepare(`
      INSERT OR IGNORE INTO payments
        (provider, order_id, status, payer_email, amount_value, amount_currency, raw_json)
      VALUES ('paypal', ?, ?, ?, ?, ?, ?)
    `).run(
      String(data.id),
      String(status),
      payerEmail,
      amount,
      currency,
      JSON.stringify(data)
    );

    // 4) Responder al front
    res.json({
      orderId: data.id,
      status,
      amount,
      currency,
      payerEmail
    });
  } catch (e) {
    console.error('PayPal capture error:', e);
    res.status(500).json({ error: 'No se pudo capturar el pago' });
  }
});


// Admin: revisar últimos pagos
app.get('/api/admin/payments', requireAuth, requireAdmin, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, provider, order_id, status, payer_email, amount_value, amount_currency, created_at
      FROM payments ORDER BY id DESC LIMIT 50
    `).all();
    res.json({ payments: rows });
  } catch (e) {
    console.error('payments admin list error', e);
    res.status(500).json({ error: 'No se pudieron obtener los pagos.' });
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
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const isMatch = await bcrypt.compare(String(currentPassword), user.password_hash);
    if (!isMatch) return res.status(401).json({ error: 'La contraseña actual no es correcta.' });

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
