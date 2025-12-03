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
const {
  sendWelcomeEmail,
  sendRequestAcceptedEmail,
  sendRequestRejectedEmail,
  sendDepositPaidEmailToMechanic,
  sendNewAppointmentRequestEmail,
} = require('./mailer');



const PORT = process.env.PORT || 3000;
const app = express();
const DEFAULT_SCHEDULE_CONFIG = { days: [1, 2, 3, 4, 5], start: '10:00', end: '18:00' };
const TIME_SLOTS = buildTimeSlots(DEFAULT_SCHEDULE_CONFIG);
const DAILY_APPOINTMENT_CAPACITY = TIME_SLOTS.length;

// ===== fetch polyfill (Node 18+ ya trae fetch; para 16/17 cargamos dinámico) =====
if (typeof fetch !== 'function') {
  global.fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
}

// ====== PayPal (Sandbox) configuración básica ======
const PAYPAL_API_BASE = process.env.PAYPAL_API || 'https://api-m.sandbox.paypal.com';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || 'ATK6vMKNkGN9nrBunM83FLJ8_6rR82v28x35yp7YpKHyajQORbwHoAhjpzmZyy9SDpUGQqf4taf0uNhg';
const PAYPAL_SECRET = process.env.PAYPAL_SECRET || 'EDX3en15c1djJA8af0H_bDoqzysgedMIwwWtig2sa61XKMTaCTpXdqwMeNpWYEo0OTIwd5vAvbhnZHm1';
const COMMISSION_PERCENT = Number.parseFloat(process.env.MECHANIC_COMMISSION_PERCENT || '10');
const MINIMUM_COMPLETION_PRICE = 20;

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
db.pragma('foreign_keys = ON');

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

function parseTimeToMinutes(value) {
  if (typeof value !== 'string') return null;

  const [hours, minutes] = value.split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function formatTimeFromMinutes(minutes) {
  if (!Number.isFinite(minutes)) {
    return '';
  }

  const hours = Math.floor(minutes / 60);
  const remainder = Math.max(0, minutes - hours * 60);
  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function padWithZero(value) {
  return String(value).padStart(2, '0');
}

function formatDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = padWithZero(date.getMonth() + 1);
  const day = padWithZero(date.getDate());
  return `${year}-${month}-${day}`;
}

function parseSlotValue(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return `${padWithZero(hours)}:${padWithZero(minutes)}`;
}

function extractSlotFromValue(value) {
  if (!value) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const [, timePart] = trimmed.split(/T|\s+/);
    const candidate = parseSlotValue((timePart || '').slice(0, 5));
    if (candidate) return candidate;

    // Fallback: try to find the first HH:MM occurrence in the string
    const match = trimmed.match(/(\d{2}:\d{2})/);
    if (match) return parseSlotValue(match[1]);
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${padWithZero(value.getHours())}:${padWithZero(value.getMinutes())}`;
  }

  return null;
}

function parseDateTimeWithSlot(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))/);
  if (!match) {
    return null;
  }

  const [, yearStr, monthStr, dayStr, hourStr, minuteStr] = match;
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10) - 1;
  const day = Number.parseInt(dayStr, 10);
  const hours = Number.parseInt(hourStr, 10);
  const minutes = Number.parseInt(minuteStr, 10);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes)
  ) {
    return null;
  }

  const date = new Date(year, month, day, hours, minutes, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTimeSlotValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const dateKey = formatDateKey(date);
  const slot = `${padWithZero(date.getHours())}:${padWithZero(date.getMinutes())}:00`;
  return `${dateKey} ${slot}`;
}

function buildTimeSlots(scheduleConfig = DEFAULT_SCHEDULE_CONFIG) {
  const startMinutes = parseTimeToMinutes(scheduleConfig?.start);
  const endMinutes = parseTimeToMinutes(scheduleConfig?.end);
  const safeStart = Number.isFinite(startMinutes) ? startMinutes : parseTimeToMinutes(DEFAULT_SCHEDULE_CONFIG.start);
  const safeEnd = Number.isFinite(endMinutes) ? endMinutes : parseTimeToMinutes(DEFAULT_SCHEDULE_CONFIG.end);

  const effectiveStart = Math.min(safeStart, safeEnd - 60);
  const effectiveEnd = Math.max(safeEnd, safeStart + 60);

  const slots = [];
  for (let minutes = effectiveStart; minutes <= effectiveEnd; minutes += 60) {
    slots.push(formatTimeFromMinutes(minutes));
  }

  return slots;
}

function normalizeScheduleConfig(config) {
  const dayList = Array.isArray(config?.days) ? config.days : DEFAULT_SCHEDULE_CONFIG.days;
  const uniqueDays = Array.from(
    new Set(
      dayList
        .map((day) => Number.parseInt(day, 10))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    )
  ).sort((a, b) => a - b);

  const days = uniqueDays.length ? uniqueDays : [...DEFAULT_SCHEDULE_CONFIG.days];

  const startMinutes = parseTimeToMinutes(config?.start);
  const endMinutes = parseTimeToMinutes(config?.end);

  const defaultStart = parseTimeToMinutes(DEFAULT_SCHEDULE_CONFIG.start);
  const defaultEnd = parseTimeToMinutes(DEFAULT_SCHEDULE_CONFIG.end);

  const start = Number.isFinite(startMinutes) ? startMinutes : defaultStart;
  const end = Number.isFinite(endMinutes) ? endMinutes : defaultEnd;

  const effectiveStart = Math.min(start, end - 60);
  const effectiveEnd = Math.max(end, start + 60);

  const normalized = {
    days,
    start: formatTimeFromMinutes(effectiveStart),
    end: formatTimeFromMinutes(effectiveEnd),
  };

  return normalized;
}

function formatScheduleLabel(config) {
  if (!config) {
    return 'Horario no especificado';
  }

  const dayLabels = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const sortedDays = Array.isArray(config.days)
    ? Array.from(new Set(config.days)).sort((a, b) => a - b)
    : [...DEFAULT_SCHEDULE_CONFIG.days];

  let daysLabel = '';
  const weekdays = [1, 2, 3, 4, 5];
  const weekend = [0, 6];

  if (sortedDays.length === 7) {
    daysLabel = 'Todos los días';
  } else if (sortedDays.every((day, idx) => day === weekdays[idx])) {
    daysLabel = 'Lunes a viernes';
  } else if (sortedDays.every((day, idx) => day === weekend[idx])) {
    daysLabel = 'Fines de semana';
  } else {
    daysLabel = sortedDays.map((day) => dayLabels[day] || '').filter(Boolean).join(', ');
  }

  const start = config.start || DEFAULT_SCHEDULE_CONFIG.start;
  const end = config.end || DEFAULT_SCHEDULE_CONFIG.end;

  return `${daysLabel} · ${start} a ${end} hrs`;
}

function parseStoredSchedule(value) {
  if (value && typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const config = normalizeScheduleConfig(parsed);
        const label = typeof parsed?.label === 'string' && parsed.label.trim()
          ? parsed.label.trim()
          : formatScheduleLabel(config);
        const slots = buildTimeSlots(config);
        return { config, label, slots, serialized: JSON.stringify({ ...config, label }) };
      } catch (error) {
        // fallback to defaults below
      }
    }

    const range = getScheduleRange(trimmed);
    const config = normalizeScheduleConfig({ ...DEFAULT_SCHEDULE_CONFIG, start: formatTimeFromMinutes(range.start), end: formatTimeFromMinutes(range.end) });
    const label = trimmed || formatScheduleLabel(config);
    const slots = buildTimeSlots(config);
    return { config, label, slots, serialized: JSON.stringify({ ...config, label }) };
  }

  const config = normalizeScheduleConfig(DEFAULT_SCHEDULE_CONFIG);
  const label = formatScheduleLabel(config);
  const slots = buildTimeSlots(config);
  return { config, label, slots, serialized: JSON.stringify({ ...config, label }) };
}

function normalizeScheduleInput(input) {
  if (input && typeof input === 'object') {
    const config = normalizeScheduleConfig(input);
    const label = formatScheduleLabel(config);
    return { config, label, serialized: JSON.stringify({ ...config, label }) };
  }

  try {
    if (typeof input === 'string' && input.trim().startsWith('{')) {
      const parsed = JSON.parse(input);
      const config = normalizeScheduleConfig(parsed);
      const label = typeof parsed?.label === 'string' && parsed.label.trim()
        ? parsed.label.trim()
        : formatScheduleLabel(config);
      return { config, label, serialized: JSON.stringify({ ...config, label }) };
    }
  } catch (error) {
    // fallback to default handling below
  }

  const config = normalizeScheduleConfig(DEFAULT_SCHEDULE_CONFIG);
  const label = typeof input === 'string' && input.trim() ? input.trim() : formatScheduleLabel(config);
  return { config, label, serialized: JSON.stringify({ ...config, label }) };
}

function scheduleAllowsDate(config, date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return false;
  }

  const allowedDays = Array.isArray(config?.days) ? config.days : DEFAULT_SCHEDULE_CONFIG.days;
  return allowedDays.includes(date.getDay());
}

function getScheduleRange(scheduleText) {
  const WORKDAY_START_MINUTES = 10 * 60;
  const WORKDAY_END_MINUTES = 18 * 60;
  const defaults = { start: WORKDAY_START_MINUTES, end: WORKDAY_END_MINUTES };
  if (!scheduleText || typeof scheduleText !== 'string') {
    return defaults;
  }

  const matches = scheduleText.match(/(\d{1,2}:\d{2})/g);
  if (!matches || matches.length < 2) {
    return defaults;
  }

  const startMinutes = Math.max(WORKDAY_START_MINUTES, parseTimeToMinutes(matches[0]));
  const endMinutes = Math.min(WORKDAY_END_MINUTES, parseTimeToMinutes(matches[matches.length - 1]));

  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
    return defaults;
  }

  return { start: startMinutes, end: endMinutes };
}

function getMechanicWorkshopSummary(mechanicId) {
  if (!mechanicId) return null;

  const row = db
    .prepare(
      `SELECT
         w.id,
         w.name,
         w.address,
         w.schedule,
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
  const schedule = parseStoredSchedule(row.schedule);

  return {
    id: row.id,
    name: row.name,
    address: row.address,
    schedule: schedule.label,
    scheduleConfig: schedule.config,
    timeSlots: schedule.slots,
    reviewsCount,
    averageRating: normalizeAverage(row.average_rating, reviewsCount),
  };
}

function resolveMechanicSchedule(mechanicId) {
  const workshop = getMechanicWorkshopSummary(mechanicId);
  if (!workshop) {
    const fallback = parseStoredSchedule(JSON.stringify({ ...DEFAULT_SCHEDULE_CONFIG, label: formatScheduleLabel(DEFAULT_SCHEDULE_CONFIG) }));
    return { label: fallback.label, config: fallback.config, slots: fallback.slots };
  }

  const config = workshop.scheduleConfig || DEFAULT_SCHEDULE_CONFIG;
  const label = workshop.schedule || formatScheduleLabel(config);
  const slots = Array.isArray(workshop.timeSlots) && workshop.timeSlots.length
    ? workshop.timeSlots
    : buildTimeSlots(config);

  return { label, config, slots };
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
  const schedule = parseStoredSchedule(row.schedule);

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
    schedule: schedule.label,
    scheduleConfig: schedule.config,
    timeSlots: schedule.slots,
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
  const schedule = parseStoredSchedule(row.schedule);

  return {
    ...summary,
    description: row.description,
    services: parseJsonArray(row.services),
    certifications: parseJsonArray(row.certifications),
    address: row.address,
    schedule: schedule.label,
    scheduleConfig: schedule.config,
    timeSlots: schedule.slots,
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

function normalizeReason(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '';
}

const CLIENT_HISTORY_BASE_QUERY = `
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
    a.rejection_reason,
    a.reschedule_reason,
    a.reschedule_requested_at,
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
  WHERE a.client_id = ?`;

const CLIENT_HISTORY_QUERY = `${CLIENT_HISTORY_BASE_QUERY}
  ORDER BY datetime(a.scheduled_for) DESC, a.id DESC`;

function mapAppointmentHistoryRow(row) {
  if (!row) return null;

  const mechanicId = Number(row.mechanic_id);
  const hasMechanic = Number.isInteger(mechanicId) && mechanicId > 0;
  const rejectionReason = normalizeReason(row.rejection_reason);
  const rescheduleReason = normalizeReason(row.reschedule_reason);

  return {
    id: Number(row.id),
    service: row.service,
    visitType: row.visit_type,
    scheduledFor: row.scheduled_for,
    status: row.status || 'pendiente',
    rejectionReason: rejectionReason || null,
    rescheduleReason: rescheduleReason || null,
    rescheduleRequestedAt: row.reschedule_requested_at || null,
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

function getClientAppointmentById(clientId, appointmentId) {
  if (!clientId || !appointmentId) return null;

  const row = db
    .prepare(`${CLIENT_HISTORY_BASE_QUERY} AND a.id = ? LIMIT 1`)
    .get(clientId, appointmentId);

  return mapAppointmentHistoryRow(row);
}

function formatNotificationDate(value, { includeTime = true } = {}) {
  if (!value) return null;
  let date;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      // Interpret fechas sin hora en horario local para evitar desfases de zona
      // (por ejemplo, que el 27 se muestre como 26 en notificaciones).
      date = new Date(Number(year), Number(month) - 1, Number(day));
    } else {
      date = new Date(trimmed);
    }
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const options = includeTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' };
  try {
    return new Intl.DateTimeFormat('es', options).format(date);
  } catch (error) {
    console.error('No se pudo formatear la fecha para la notificación', error);
    return null;
  }
}

function limitNotifications(list, limit = 6) {
  const seen = new Set();
  const filtered = [];
  list.forEach((notification) => {
    if (!notification?.id || seen.has(notification.id)) {
      return;
    }
    seen.add(notification.id);
    filtered.push(notification);
  });
  return filtered.slice(0, limit);
}

function getClientNotifications(clientId) {
  if (!clientId) return [];

  const rows = db
    .prepare(
      `SELECT id, service, status, rejection_reason, scheduled_for, created_at, abono_pagado, reschedule_reason, reschedule_requested_at
       FROM appointments
       WHERE client_id = ?
       ORDER BY datetime(created_at) DESC, id DESC
       LIMIT 20`
    )
    .all(clientId);

  const notifications = [];

  rows.forEach((row) => {
    const normalizedStatus = (row.status || 'pendiente').toLowerCase();
    const service = row.service || 'tu cita';
    const scheduledLabel = formatNotificationDate(row.scheduled_for, { includeTime: false });
    const rescheduleReason = normalizeReason(row.reschedule_reason);
    const hasRescheduleRequest = Boolean(rescheduleReason || row.reschedule_requested_at);

    if (normalizedStatus === 'rechazado') {
      const reasonText = normalizeReason(row.rejection_reason);
      const reasonSuffix = reasonText ? ` Motivo: ${reasonText}` : '';
      notifications.push({
        id: `client-rejected-${row.id}`,
        type: 'warning',
        message: `El taller rechazó ${service}.${reasonSuffix}`,
        action: { label: 'Ver historial', href: './perfil.html#historial' },
      });
      return;
    }

    if (normalizedStatus === 'confirmado') {
      const abonoPagado =
        row.abono_pagado === 1 ||
        row.abono_pagado === '1' ||
        row.abono_pagado === true;

      if (abonoPagado) {
        const abonoMessageBase = 'Abono realizado. Gracias por tu pago, tu cita ya quedó reservada para ti. ¡No faltes!';

        notifications.push({
          id: `client-abono-paid-${row.id}`,
          type: 'success',
          message: scheduledLabel
            ? `${abonoMessageBase} Detalles: ${service} para ${scheduledLabel}.`
            : `${abonoMessageBase} Detalles: ${service}.`,
          // sin action, porque ya está pagado
        });
        return;
      }

      // Si NO está pagado, mostramos el botón para ir a pagar
      const query = new URLSearchParams();
      if (row.id) {
        query.set('appointmentId', row.id);
      }
      if (service) {
        query.set('service', service);
      }
      const paymentHref = `./pago-abono.html${query.toString() ? `?${query.toString()}` : ''}`;

      notifications.push({
        id: `client-confirmed-${row.id}`,
        type: 'success',
        message: scheduledLabel
          ? `Tu cita de ${service} para ${scheduledLabel} fue confirmada. Paga tu abono para reconfirmar tu visita.`
          : `Tu cita de ${service} fue confirmada. Paga tu abono para reconfirmar tu visita.`,
        action: { label: 'Paga tu abono', href: paymentHref },
      });
      return;
    }



    if (normalizedStatus === 'pendiente') {
      notifications.push({
        id: `client-pending-${row.id}`,
        type: 'info',
        message: hasRescheduleRequest
          ? scheduledLabel
            ? `Solicitaste reagendar ${service} para ${scheduledLabel}. Espera la confirmación del mecánico.`
            : `Solicitaste reagendar ${service}. Espera la confirmación del mecánico.`
          : scheduledLabel
            ? `Tu solicitud de ${service} está pendiente para ${scheduledLabel}.`
            : `Tu solicitud de ${service} está pendiente de confirmación.`,
        action: { label: 'Ver historial', href: './perfil.html#historial' },
      });
      return;
    }

    if (normalizedStatus === 'completado') {
      notifications.push({
        id: `client-completed-${row.id}`,
        type: 'info',
        message: scheduledLabel
          ? `Tu visita de ${service} del ${scheduledLabel} fue finalizada. ¡Comparte tu reseña!`
          : `Tu visita de ${service} fue finalizada. ¡Comparte tu reseña!`,
        action: { label: 'Escribir reseña', href: './resenas-mecanicos.html' },
      });
    }
  });

  return limitNotifications(notifications, 6);
}

function getMechanicNotifications(mechanicId) {
  if (!mechanicId) return [];

  const pendingRequests = db
    .prepare(
      `SELECT id, service, scheduled_for, created_at, reschedule_reason, reschedule_requested_at
       FROM appointments
       WHERE mechanic_id = ? AND status = 'pendiente'
       ORDER BY datetime(created_at) DESC, id DESC
       LIMIT 8`
    )
    .all(mechanicId);

  const upcomingConfirmed = db
    .prepare(
      `SELECT id, service, scheduled_for
       FROM appointments
       WHERE mechanic_id = ? AND status = 'confirmado'
       ORDER BY datetime(scheduled_for) ASC, id ASC
       LIMIT 8`
    )
    .all(mechanicId);

  const notifications = [];

  pendingRequests.forEach((row) => {
    const scheduledLabel = formatNotificationDate(row.scheduled_for);
    const rescheduleReason = normalizeReason(row.reschedule_reason);
    const hasRescheduleRequest = Boolean(rescheduleReason || row.reschedule_requested_at);
    notifications.push({
      id: `mechanic-pending-${row.id}`,
      type: 'info',
      message: hasRescheduleRequest
        ? `Solicitud de reagendamiento para ${row.service || 'servicio'}${scheduledLabel ? ` el ${scheduledLabel}` : ''}.` +
        (rescheduleReason ? ` Motivo: ${rescheduleReason}.` : '')
        : scheduledLabel
          ? `Nueva solicitud de ${row.service || 'servicio'} propuesta para ${scheduledLabel}.`
          : `Tienes una nueva solicitud de ${row.service || 'servicio'}.`,
      action: {
        label: hasRescheduleRequest ? 'Revisar reagendamiento' : 'Gestionar solicitud',
        href: `./solicitud.html?id=${row.id}`,
      },
    });
  });

  upcomingConfirmed.forEach((row) => {
    const scheduledLabel = formatNotificationDate(row.scheduled_for);
    notifications.push({
      id: `mechanic-confirmed-${row.id}`,
      type: 'success',
      message: scheduledLabel
        ? `Cita confirmada para ${row.service || 'servicio'} el ${scheduledLabel}.`
        : `Tienes una cita confirmada próxima a realizarse.`,
      action: { label: 'Ver agenda', href: './perfil.html#solicitudes' },
    });
  });

  return limitNotifications(notifications, 8);
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

/**
 * Columnas para recuperación de contraseña:
 * - reset_token: token aleatorio
 * - reset_token_expires: fecha/hora de expiración (ISO string)
 */
function ensurePasswordResetColumns() {
  const columns = db.prepare(`PRAGMA table_info(users)`).all();

  const hasResetToken = columns.some((column) => column.name === 'reset_token');
  const hasResetExpires = columns.some((column) => column.name === 'reset_token_expires');

  if (!hasResetToken) {
    db.prepare(`ALTER TABLE users ADD COLUMN reset_token TEXT`).run();
  }

  if (!hasResetExpires) {
    db.prepare(`ALTER TABLE users ADD COLUMN reset_token_expires TEXT`).run();
  }
}

ensureCertificateStatusColumn();
ensureCertificatePathColumn();
ensurePasswordResetColumns();


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
      workshop_id TEXT REFERENCES workshops(id),
      service TEXT NOT NULL,
      visit_type TEXT NOT NULL CHECK (visit_type IN ('presencial','domicilio')),
      scheduled_for TEXT NOT NULL,
      address TEXT,
      notes TEXT,
      client_latitude REAL,
      client_longitude REAL,
      status TEXT NOT NULL DEFAULT 'pendiente',
      rejection_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES users(id),
      FOREIGN KEY (mechanic_id) REFERENCES users(id)
    )
  `).run();
}
ensureAppointmentsTable();

function ensureAppointmentLocationColumns() {
  const columns = db.prepare(`PRAGMA table_info(appointments)`).all();
  const hasLatitude = columns.some((column) => column.name === 'client_latitude');
  const hasLongitude = columns.some((column) => column.name === 'client_longitude');
  const hasRejectionReason = columns.some((column) => column.name === 'rejection_reason');
  const hasDepositPaid = columns.some((column) => column.name === 'abono_pagado');
  const hasRescheduleReason = columns.some((column) => column.name === 'reschedule_reason');
  const hasRescheduleRequestedAt = columns.some((column) => column.name === 'reschedule_requested_at');
  const hasFinalPrice = columns.some((column) => column.name === 'final_price');
  const hasCompletedAt = columns.some((column) => column.name === 'completed_at');
  const hasWorkshopId = columns.some((column) => column.name === 'workshop_id');

  if (!hasLatitude) {
    db.prepare(`ALTER TABLE appointments ADD COLUMN client_latitude REAL`).run();
  }

  if (!hasLongitude) {
    db.prepare(`ALTER TABLE appointments ADD COLUMN client_longitude REAL`).run();
  }

  if (!hasRejectionReason) {
    db.prepare(`ALTER TABLE appointments ADD COLUMN rejection_reason TEXT`).run();
  }

  if (!hasDepositPaid) {
    db.prepare(`ALTER TABLE appointments ADD COLUMN abono_pagado INTEGER NOT NULL DEFAULT 0`).run();
  }

  if (!hasRescheduleReason) {
    db.prepare(`ALTER TABLE appointments ADD COLUMN reschedule_reason TEXT`).run();
  }

  if (!hasRescheduleRequestedAt) {
    db.prepare(`ALTER TABLE appointments ADD COLUMN reschedule_requested_at TEXT`).run();
  }

  if (!hasFinalPrice) {
    db.prepare(`ALTER TABLE appointments ADD COLUMN final_price REAL`).run();
  }

  if (!hasCompletedAt) {
    db.prepare(`ALTER TABLE appointments ADD COLUMN completed_at TEXT`).run();
  }

  if (!hasWorkshopId) {
    db.prepare(`ALTER TABLE appointments ADD COLUMN workshop_id TEXT REFERENCES workshops(id)`).run();
  }
}
ensureAppointmentLocationColumns();

function backfillAppointmentWorkshopIds() {
  try {
    const columns = db.prepare(`PRAGMA table_info(appointments)`).all();
    const hasWorkshopId = columns.some((column) => column.name === 'workshop_id');
    if (!hasWorkshopId) {
      return;
    }

    db.prepare(`
      UPDATE appointments
         SET workshop_id = (
           SELECT id FROM workshops WHERE owner_id = appointments.mechanic_id LIMIT 1
         )
       WHERE workshop_id IS NULL
    `).run();
  } catch (error) {
    console.error('No se pudieron sincronizar los IDs de taller en las citas', error);
  }
}
backfillAppointmentWorkshopIds();

function ensureCommissionsTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS commissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER NOT NULL UNIQUE,
      mechanic_id INTEGER NOT NULL,
      service TEXT,
      category TEXT,
      work_price REAL NOT NULL,
      commission_percent REAL NOT NULL,
      commission_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendiente',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      paid_at TEXT,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
      FOREIGN KEY (mechanic_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();
}
ensureCommissionsTable();

function tableExists(tableName) {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(tableName);
  return Boolean(row?.name);
}

function getServiceMinimumPrice(serviceName) {
  if (!serviceName || !tableExists('service_categories')) {
    return null;
  }

  const row = db
    .prepare(`SELECT min_price FROM service_categories WHERE LOWER(name) = LOWER(?) LIMIT 1`)
    .get(serviceName);

  return row?.min_price != null ? Number(row.min_price) : null;
}

function getHistoricalAveragePrice(serviceName) {
  if (!serviceName) {
    return null;
  }

  const row = db
    .prepare(
      `SELECT AVG(final_price) AS average_price
       FROM appointments
       WHERE status = 'completado'
         AND final_price IS NOT NULL
         AND LOWER(service) = LOWER(?)`
    )
    .get(serviceName);

  return row?.average_price != null ? Number(row.average_price) : null;
}

function createCommissionRecord({ appointmentId, mechanicId, service, workPrice, category }) {
  if (!appointmentId || !mechanicId || !Number.isFinite(workPrice)) {
    return null;
  }

  const percent = Number.isFinite(COMMISSION_PERCENT) ? COMMISSION_PERCENT : 0;
  const amount = Number(((workPrice * percent) / 100).toFixed(2));

  db.prepare(
    `INSERT OR IGNORE INTO commissions
      (appointment_id, mechanic_id, service, category, work_price, commission_percent, commission_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(appointmentId, mechanicId, service || null, category || null, workPrice, percent, amount);
}

function ensureMechanicDismissedRequestsTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS mechanic_dismissed_requests (
      mechanic_id INTEGER NOT NULL,
      appointment_id INTEGER NOT NULL,
      dismissed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (mechanic_id, appointment_id),
      FOREIGN KEY (mechanic_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
    )
  `).run();
}
ensureMechanicDismissedRequestsTable();

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

async function deleteCertificateFile(relativePath) {
  if (!relativePath) return;

  const absolutePath = path.join(dataDir, relativePath);
  const normalizedPath = path.normalize(absolutePath);

  if (!normalizedPath.startsWith(certificatesDirNormalized)) {
    return;
  }

  try {
    await fsp.unlink(normalizedPath);
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.error('No se pudo eliminar el certificado', error);
    }
  }
}

const workshopPhotosDir = path.join(dataDir, 'workshop-photos');
fs.mkdirSync(workshopPhotosDir, { recursive: true });
const workshopPhotosDirNormalized = path.normalize(workshopPhotosDir + path.sep);

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

async function deleteWorkshopPhotoFile(relativePath) {
  if (!relativePath) return;

  const normalizedRelative = String(relativePath).replace(/^\.\.\//, '');
  if (!normalizedRelative.startsWith('workshop-photos')) {
    return;
  }

  const absolutePath = path.join(dataDir, normalizedRelative);
  const normalizedAbsolutePath = path.normalize(absolutePath);

  if (!normalizedAbsolutePath.startsWith(workshopPhotosDirNormalized)) {
    return;
  }

  try {
    await fsp.unlink(normalizedAbsolutePath);
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.error('No se pudo eliminar la fotografía del taller', error);
    }
  }
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

app.get('/mecanico/comisiones-pendientes', (req, res) => {
  res.sendFile(path.join(__dirname, 'pages', 'comisionesPendientes.html'));
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

    const normalizedSchedule = normalizeScheduleInput(schedule);
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
      normalizedSchedule.serialized,
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
    const normalizedSchedule = normalizeScheduleInput(schedule || existing.schedule);
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
      normalizedSchedule.serialized,
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

app.delete('/api/workshops/:id', requireAuth, requireMechanic, async (req, res) => {
  const workshopId = String(req.params.id || '').trim();
  if (!workshopId) return res.status(400).json({ error: 'Identificador de taller no válido.' });

  try {
    const existing = db
      .prepare(`SELECT id, owner_id, photo FROM workshops WHERE id = ? LIMIT 1`)
      .get(workshopId);

    if (!existing) {
      return res.status(404).json({ error: 'Taller no encontrado.' });
    }

    if (Number(existing.owner_id) !== Number(req.session.userId)) {
      return res.status(403).json({ error: 'Solo puedes eliminar tu propio taller.' });
    }

    try {
      await deleteWorkshopPhotoFile(existing.photo);
    } catch (error) {
      console.error('No se pudo limpiar la fotografía del taller', error);
    }

    db.prepare(`DELETE FROM workshops WHERE id = ?`).run(workshopId);
    res.json({ message: 'Taller eliminado correctamente.' });
  } catch (error) {
    console.error('Error eliminando taller', error);
    res.status(500).json({ error: 'No pudimos eliminar tu taller en este momento.' });
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
    const workshop = db
      .prepare(`SELECT id, owner_id FROM workshops WHERE id = ?`)
      .get(workshopId);
    if (!workshop) return res.status(404).json({ error: 'El taller seleccionado no existe.' });

    const user = db
      .prepare(`SELECT id, name, account_type FROM users WHERE id = ?`)
      .get(req.session.userId);
    if (!user) return res.status(401).json({ error: 'No autorizado.' });
    if (user.account_type !== 'cliente') {
      return res.status(403).json({ error: 'Solo los clientes pueden publicar reseñas.' });
    }

    const hasCompletedAppointment = db
      .prepare(
        `SELECT COUNT(*) AS total
           FROM appointments
          WHERE client_id = ?
            AND LOWER(COALESCE(status, '')) = 'completado'
            AND (
              workshop_id = ?
              OR (workshop_id IS NULL AND mechanic_id = ?)
            )`
      )
      .get(user.id, workshopId, workshop.owner_id || -1);

    if (!hasCompletedAppointment?.total) {
      return res.status(403).json({ error: 'Solo puedes reseñar talleres con los que hayas tenido una cita completada.' });
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

    // 👉 intentar enviar correo de bienvenida (sin romper el registro si falla)
    try {
      await sendWelcomeEmail({
        to: normalizedEmail,
        nombre: name.trim(),
      });
    } catch (emailError) {
      console.error('Error enviando correo de bienvenida:', emailError);
    }

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
app.post('/api/password/forgot', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'Ingresa tu correo electrónico.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Buscar usuario por correo
    const user = db
      .prepare(`SELECT id, email FROM users WHERE email = ?`)
      .get(normalizedEmail);

    // Por seguridad, respondemos lo mismo aunque no exista
    if (!user) {
      return res.json({
        message:
          'Si el correo está registrado, te enviaremos un enlace para restablecer la contraseña.',
      });
    }

    // 1) Generar token aleatorio
    const token = crypto.randomBytes(32).toString('hex');

    // 2) Expiración del token: 1 hora a partir de ahora
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    // 3) Guardar en la base de datos
    db.prepare(`
      UPDATE users
      SET reset_token = ?, reset_token_expires = ?
      WHERE id = ?
    `).run(token, expires, user.id);

    // 4) Construir URL de restablecimiento
    //    Ejemplo: http://localhost:3000/pages/restablecer-contrasena.html?token=XYZ
    // baseUrl igual que antes
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    // 👇 ahora apuntamos a restablecer-contrasena.html y mandamos token + email
    const resetUrl = `${baseUrl}/restablecer-contrasena.html?token=${encodeURIComponent(
      token
    )}&email=${encodeURIComponent(normalizedEmail)}`;

    // 5) Devolver al front un mensaje genérico + el link para el correo
    return res.json({
      message:
        'Si el correo está registrado, te enviaremos un enlace para restablecer la contraseña.',
      resetUrl, // 👈 ESTE es el link que usará EmailJS
    });

  } catch (error) {
    console.error('Error en /api/password/forgot', error);
    res.status(500).json({ error: 'Ocurrió un error al procesar la solicitud.' });
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
      .prepare(
        `SELECT id, name, email, account_type, created_at, certificate_status, certificate_uploaded FROM users WHERE id = ?`
      )
      .get(
        req.session.userId
      );

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      accountType: user.account_type,
      certificateStatus: user.certificate_status,
      certificateUploaded: Boolean(user.certificate_uploaded),
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

app.post('/api/profile/request-mechanic', requireAuth, async (req, res) => {
  let newCertificatePath = null;

  try {
    const user = db
      .prepare(`SELECT id, email, account_type, certificate_path FROM users WHERE id = ?`)
      .get(req.session.userId);

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    if (user.account_type !== 'cliente') {
      return res.status(400).json({ error: 'Solo los clientes pueden solicitar el cambio de rol.' });
    }

    const { certificate } = req.body || {};
    if (!certificate || typeof certificate !== 'object') {
      return res
        .status(400)
        .json({ error: 'Adjunta el certificado o formulario en formato PDF o imagen.' });
    }

    try {
      newCertificatePath = await storeCertificateFile(certificate, user.email);
    } catch (error) {
      return res.status(400).json({ error: error.message || 'No se pudo guardar el certificado.' });
    }

    db.prepare(
      `UPDATE users
       SET certificate_uploaded = 1,
           certificate_status = 'pendiente',
           certificate_path = ?,
           account_type = 'cliente'
       WHERE id = ?`
    ).run(newCertificatePath, user.id);

    if (user.certificate_path && user.certificate_path !== newCertificatePath) {
      await deleteCertificateFile(user.certificate_path);
    }

    req.session.destroy((destroyError) => {
      if (destroyError) {
        console.error('No se pudo cerrar la sesión después de solicitar el cambio de rol', destroyError);
      }
    });

    res.json({
      message:
        'Recibimos tu formulario. Te llevaremos al inicio de sesión para continuar cuando el administrador lo apruebe.',
    });
  } catch (error) {
    if (newCertificatePath) {
      await deleteCertificateFile(newCertificatePath).catch(() => { });
    }
    console.error('Error al solicitar cambio de rol', error);
    res.status(500).json({ error: 'No se pudo procesar tu solicitud en este momento.' });
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

app.post('/api/appointments/:id/cancel', requireAuth, (req, res) => {
  const appointmentId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
    return res.status(400).json({ error: 'Identificador de cita no válido.' });
  }

  try {
    const user = db.prepare(`SELECT id, account_type FROM users WHERE id = ?`).get(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    if (user.account_type !== 'cliente') {
      return res.status(403).json({ error: 'Solo los clientes pueden cancelar sus citas desde aquí.' });
    }

    const appointment = db
      .prepare(`SELECT id, client_id, mechanic_id, status FROM appointments WHERE id = ? LIMIT 1`)
      .get(appointmentId);

    if (!appointment || appointment.client_id !== user.id) {
      return res.status(404).json({ error: 'No encontramos la cita que intentas cancelar.' });
    }

    const normalizedStatus = appointment.status ? appointment.status.toLowerCase() : 'pendiente';
    if (['cancelado', 'rechazado', 'completado'].includes(normalizedStatus)) {
      return res.status(400).json({ error: 'Esta cita ya no se puede cancelar.' });
    }

    db.prepare(
      `UPDATE appointments
       SET status = 'cancelado',
           rejection_reason = NULL,
           reschedule_reason = NULL,
           reschedule_requested_at = NULL
       WHERE id = ?`
    ).run(appointmentId);

    if (appointment.mechanic_id) {
      db.prepare(
        `DELETE FROM mechanic_dismissed_requests WHERE mechanic_id = ? AND appointment_id = ?`
      ).run(appointment.mechanic_id, appointmentId);
    }

    const updated = getClientAppointmentById(user.id, appointmentId);
    res.json({ appointment: updated, message: 'Cancelaste tu cita correctamente.' });
  } catch (error) {
    console.error('Error cancelando cita', error);
    res.status(500).json({ error: 'No pudimos cancelar tu cita. Inténtalo nuevamente.' });
  }
});

app.post('/api/appointments/:id/reschedule', requireAuth, (req, res) => {
  const appointmentId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
    return res.status(400).json({ error: 'Identificador de cita no válido.' });
  }

  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  const newDate = typeof req.body?.date === 'string' ? req.body.date.trim() : '';
  const slotInput = typeof req.body?.slot === 'string' ? req.body.slot.trim() : '';

  if (!reason) {
    return res.status(400).json({ error: 'Describe el motivo del reagendamiento.' });
  }
  if (reason.length > 500) {
    return res.status(400).json({ error: 'El motivo del reagendamiento no puede superar los 500 caracteres.' });
  }

  try {
    const user = db.prepare(`SELECT id, account_type FROM users WHERE id = ?`).get(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    if (user.account_type !== 'cliente') {
      return res.status(403).json({ error: 'Solo los clientes pueden reagendar desde su perfil.' });
    }

    const appointment = db
      .prepare(
        `SELECT id, client_id, mechanic_id, status, visit_type, address, scheduled_for
         FROM appointments
         WHERE id = ?
         LIMIT 1`
      )
      .get(appointmentId);

    if (!appointment || appointment.client_id !== user.id) {
      return res.status(404).json({ error: 'No encontramos la cita que intentas reagendar.' });
    }

    const normalizedStatus = appointment.status ? appointment.status.toLowerCase() : 'pendiente';
    if (['cancelado', 'rechazado', 'completado'].includes(normalizedStatus)) {
      return res.status(400).json({ error: 'Esta cita ya no se puede reagendar.' });
    }

    const mechanicId = Number(appointment.mechanic_id);
    if (!Number.isInteger(mechanicId) || mechanicId <= 0) {
      return res.status(400).json({ error: 'No se encontró el taller asignado a tu cita.' });
    }

    const parsedDate = parseDateOnly(newDate);
    const normalizedSlot = parseSlotValue(slotInput);
    if (!parsedDate || !normalizedSlot) {
      return res.status(400).json({ error: 'Selecciona una fecha y hora válidas para reagendar.' });
    }

    const [hours, minutes] = normalizedSlot.split(':').map((part) => Number.parseInt(part, 10));
    parsedDate.setHours(hours, minutes, 0, 0);
    const scheduledDateTime = parseDateTimeWithSlot(parsedDate);

    if (!(scheduledDateTime instanceof Date) || Number.isNaN(scheduledDateTime.getTime())) {
      return res.status(400).json({ error: 'La fecha seleccionada no es válida.' });
    }

    const now = new Date();
    if (scheduledDateTime <= now) {
      return res.status(400).json({ error: 'El nuevo horario debe ser en el futuro.' });
    }

    const mechanicSchedule = resolveMechanicSchedule(mechanicId);
    if (!scheduleAllowsDate(mechanicSchedule.config, scheduledDateTime)) {
      return res.status(400).json({ error: 'El taller no atiende el día seleccionado.' });
    }

    if (!mechanicSchedule.slots.includes(normalizedSlot)) {
      return res.status(400).json({ error: 'Selecciona un horario dentro de la jornada del taller.' });
    }

    const scheduledValue = formatDateTimeSlotValue(scheduledDateTime);
    const dateKey = formatDateKey(scheduledDateTime);

    const dailyCapacity = mechanicSchedule.slots.length || DAILY_APPOINTMENT_CAPACITY;
    const dailyTotal = db
      .prepare(
        `SELECT COUNT(DISTINCT strftime('%H:%M', scheduled_for)) AS total
         FROM appointments
         WHERE mechanic_id = ?
           AND DATE(scheduled_for) = DATE(?)
           AND id != ?
           AND COALESCE(status, 'pendiente') NOT IN ('cancelada', 'rechazada')`
      )
      .get(mechanicId, dateKey, appointmentId);

    if ((dailyTotal?.total || 0) >= dailyCapacity) {
      return res.status(400).json({ error: 'Este día ya no tiene cupos disponibles.' });
    }

    const slotConflict = db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM appointments
         WHERE mechanic_id = ?
           AND DATE(scheduled_for) = DATE(?)
           AND strftime('%H:%M', scheduled_for) = ?
           AND id != ?
           AND COALESCE(status, 'pendiente') NOT IN ('cancelada', 'rechazada')`
      )
      .get(mechanicId, dateKey, normalizedSlot, appointmentId);

    if ((slotConflict?.total || 0) > 0) {
      return res.status(400).json({ error: 'Ese horario ya está reservado para el día seleccionado.' });
    }

    db.prepare(
      `UPDATE appointments
       SET scheduled_for = ?,
           status = 'pendiente',
           reschedule_reason = ?,
           reschedule_requested_at = CURRENT_TIMESTAMP,
           rejection_reason = NULL
       WHERE id = ? AND client_id = ?`
    ).run(scheduledValue, reason, appointmentId, user.id);

    db.prepare(
      `DELETE FROM mechanic_dismissed_requests WHERE mechanic_id = ? AND appointment_id = ?`
    ).run(mechanicId, appointmentId);

    const updated = getClientAppointmentById(user.id, appointmentId);
    res.json({ appointment: updated, message: 'Tu solicitud de reagendamiento fue enviada.' });
  } catch (error) {
    console.error('Error reagendando cita', error);
    res.status(500).json({ error: 'No pudimos reagendar tu cita. Inténtalo nuevamente.' });
  }
});

app.get('/api/notifications', requireAuth, (req, res) => {
  try {
    const user = db.prepare(`SELECT id, account_type FROM users WHERE id = ?`).get(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const normalizedAccountType = String(user.account_type || '').trim().toLowerCase();

    const notifications =
      normalizedAccountType === 'mecanico'
        ? getMechanicNotifications(user.id)
        : getClientNotifications(user.id);

    res.json({ notifications });
  } catch (error) {
    console.error('Error obteniendo notificaciones', error);
    res.status(500).json({ error: 'No se pudieron obtener las notificaciones.' });
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
        workshop: getMechanicWorkshopSummary(mechanic.id),
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

    const start = formatDateKey(today);
    const end = formatDateKey(endLimit);

    const mechanicSchedule = resolveMechanicSchedule(mechanicId);
    const dailyCapacity = mechanicSchedule.slots.length || DAILY_APPOINTMENT_CAPACITY;

    const rows = db
      .prepare(
        `SELECT DATE(scheduled_for) AS day, scheduled_for
         FROM appointments
         WHERE mechanic_id = ?
           AND DATE(scheduled_for) BETWEEN DATE(?) AND DATE(?)
           AND COALESCE(status, 'pendiente') NOT IN ('cancelada', 'rechazada')`
      )
      .all(mechanicId, start, end);

    const daySlots = new Map();
    for (const row of rows) {
      const day = typeof row?.day === 'string' ? row.day : null;
      const slot = extractSlotFromValue(row?.scheduled_for);
      if (!day || !slot) continue;
      if (!daySlots.has(day)) {
        daySlots.set(day, new Set());
      }
      daySlots.get(day).add(slot);
    }

    const unavailableDays = Array.from(daySlots.entries())
      .filter(([, slots]) => slots.size >= dailyCapacity)
      .map(([day]) => day);

    res.json({ unavailableDays });
  } catch (error) {
    console.error('Error obteniendo disponibilidad de citas', error);
    res.status(500).json({ error: 'No se pudo obtener la disponibilidad de citas.' });
  }
});

app.get('/api/appointments/unavailable-slots', requireAuth, (req, res) => {
  try {
    const mechanicId = Number.parseInt(req.query.mechanicId, 10);
    const dateParam = typeof req.query.date === 'string' ? req.query.date : '';

    if (!Number.isInteger(mechanicId) || mechanicId <= 0) {
      return res.json({ unavailableSlots: [], totalSlots: DAILY_APPOINTMENT_CAPACITY });
    }

    const mechanic = db
      .prepare(
        `SELECT id FROM users WHERE id = ? AND account_type = 'mecanico' AND certificate_status = 'validado'`
      )
      .get(mechanicId);

    if (!mechanic) {
      return res.status(404).json({ error: 'El mecánico seleccionado no está disponible.' });
    }

    const parsedDate = new Date(dateParam);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.json({ unavailableSlots: [], totalSlots: DAILY_APPOINTMENT_CAPACITY });
    }

    const dateKey = formatDateKey(parsedDate);

    const mechanicSchedule = resolveMechanicSchedule(mechanicId);
    const totalSlots = mechanicSchedule.slots.length || DAILY_APPOINTMENT_CAPACITY;

    const rows = db
      .prepare(
        `SELECT scheduled_for
         FROM appointments
         WHERE mechanic_id = ?
           AND DATE(scheduled_for) = DATE(?)
           AND COALESCE(status, 'pendiente') NOT IN ('cancelada', 'rechazada')`
      )
      .all(mechanicId, dateKey);

    const unavailableSlots = rows
      .map((row) => extractSlotFromValue(row?.scheduled_for))
      .filter((slot) => typeof slot === 'string');

    const uniqueSlots = Array.from(new Set(unavailableSlots));

    res.json({ unavailableSlots: uniqueSlots, totalSlots });
  } catch (error) {
    console.error('Error obteniendo horarios ocupados', error);
    res.status(500).json({ error: 'No se pudo obtener los horarios ocupados.' });
  }
});

const parseDateOnly = (value) => {
  if (typeof value !== 'string') return null;

  const [yearStr, monthStr, dayStr] = value.split('-');
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

app.post('/api/appointments', requireAuth, async (req, res) => {
  try {
    const currentUser = db
      .prepare(`SELECT id, name, email, account_type FROM users WHERE id = ?`)
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
      return res.status(400).json({ error: 'Selecciona la fecha de la visita.' });
    }
    const scheduledDateTime = parseDateTimeWithSlot(scheduledFor);
    const scheduledSlot = extractSlotFromValue(scheduledFor);
    if (!(scheduledDateTime instanceof Date) || !scheduledSlot) {
      return res.status(400).json({ error: 'La fecha u horario seleccionado no es válido.' });
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
        `SELECT id, name, email
         FROM users
         WHERE id = ? AND account_type = 'mecanico' AND certificate_status = 'validado'`
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

    const now = new Date();
    if (scheduledDateTime < now) {
      return res.status(400).json({ error: 'No puedes agendar una hora en el pasado.' });
    }

    const mechanicSchedule = resolveMechanicSchedule(parsedMechanicId);
    if (!scheduleAllowsDate(mechanicSchedule.config, scheduledDateTime)) {
      return res.status(400).json({ error: 'El taller no atiende el día seleccionado.' });
    }

    if (!mechanicSchedule.slots.includes(scheduledSlot)) {
      return res.status(400).json({ error: 'Selecciona un horario dentro de la jornada del taller.' });
    }

    const dailyCapacity = mechanicSchedule.slots.length || DAILY_APPOINTMENT_CAPACITY;

    const formatLocalDateTime = (value) => {
      if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        return null;
      }
      return formatDateTimeSlotValue(value);
    };

    const scheduledValue = formatLocalDateTime(scheduledDateTime);
    if (!scheduledValue) {
      return res.status(400).json({ error: 'La fecha seleccionada no es válida.' });
    }

    const dateKey = formatDateKey(scheduledDateTime);
    const dailyTotal = db
      .prepare(
        `SELECT COUNT(DISTINCT strftime('%H:%M', scheduled_for)) AS total
         FROM appointments
         WHERE mechanic_id = ?
           AND DATE(scheduled_for) = DATE(?)
           AND COALESCE(status, 'pendiente') NOT IN ('cancelada', 'rechazada')`
      )
      .get(parsedMechanicId, dateKey);

    if ((dailyTotal?.total || 0) >= dailyCapacity) {
      return res.status(400).json({ error: 'Este día ya no tiene cupos disponibles.' });
    }

    const slotConflict = db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM appointments
         WHERE mechanic_id = ?
           AND DATE(scheduled_for) = DATE(?)
           AND strftime('%H:%M', scheduled_for) = ?
           AND COALESCE(status, 'pendiente') NOT IN ('cancelada', 'rechazada')`
      )
      .get(parsedMechanicId, dateKey, scheduledSlot);

    if ((slotConflict?.total || 0) > 0) {
      return res.status(400).json({ error: 'Ese horario ya está reservado para el día seleccionado.' });
    }

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
      scheduledValue,
      normalizedAddress,
      trimmedNotes || null,
      parseCoordinate(clientLatitude),
      parseCoordinate(clientLongitude)
    );

    // 👉 Intentar enviar correo al mecánico avisando de la nueva solicitud
    try {
      if (mechanic.email) {
        const fechaFormateada =
          formatNotificationDate(scheduledValue, { includeTime: false }) || dateKey;

        await sendNewAppointmentRequestEmail({
          to: mechanic.email,
          nombreMecanico: mechanic.name,
          nombreCliente: currentUser.name || 'Cliente MechApp',
          servicio: normalizedService,
          fecha: fechaFormateada,
          hora: scheduledSlot,
        });
      }
    } catch (emailError) {
      console.error('Error enviando correo de nueva solicitud al mecánico:', emailError);
      // No rompemos la API si falla el correo
    }

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
    a.rejection_reason,
    a.final_price,
    a.completed_at,
    a.reschedule_reason,
    a.reschedule_requested_at,
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

  const rejectionReason = normalizeReason(row.rejection_reason);
  const rescheduleReason = normalizeReason(row.reschedule_reason);

  return {
    id: row.id,
    service: row.service,
    visitType: row.visit_type,
    scheduledFor: row.scheduled_for,
    address: row.address,
    notes: row.notes,
    status: row.status,
    rejectionReason: rejectionReason || null,
    finalPrice: row.final_price != null ? Number(row.final_price) : null,
    completedAt: row.completed_at || null,
    rescheduleReason: rescheduleReason || null,
    rescheduleRequestedAt: row.reschedule_requested_at || null,
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

function mapCommission(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    appointmentId: row.appointment_id,
    mechanicId: row.mechanic_id,
    service: row.service,
    category: row.category,
    workPrice: row.work_price != null ? Number(row.work_price) : null,
    commissionPercent: row.commission_percent != null ? Number(row.commission_percent) : null,
    commissionAmount: row.commission_amount != null ? Number(row.commission_amount) : null,
    status: row.status,
    createdAt: row.created_at,
    paidAt: row.paid_at || null,
    scheduledFor: row.scheduled_for || null,
    finalPrice: row.final_price != null ? Number(row.final_price) : null,
  };
}

app.get('/api/appointments/requests', requireAuth, requireMechanic, (req, res) => {
  try {
    const requests = db
      .prepare(
        `${APPOINTMENT_REQUEST_BASE_QUERY}
        WHERE a.mechanic_id = ?
          AND a.id NOT IN (
            SELECT appointment_id FROM mechanic_dismissed_requests WHERE mechanic_id = ?
          )
        ORDER BY datetime(a.scheduled_for) ASC`
      )
      .all(req.session.userId, req.session.userId);

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

app.post('/api/appointments/requests/:id/dismiss', requireAuth, requireMechanic, (req, res) => {
  const requestId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Identificador de solicitud no válido.' });
  }

  try {
    const existing = db
      .prepare('SELECT id FROM appointments WHERE id = ? AND mechanic_id = ? LIMIT 1')
      .get(requestId, req.session.userId);

    if (!existing) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }

    db.prepare(
      `INSERT OR REPLACE INTO mechanic_dismissed_requests (mechanic_id, appointment_id)
       VALUES (?, ?)`
    ).run(req.session.userId, requestId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error ocultando solicitud de cita', error);
    res.status(500).json({ error: 'No se pudo ocultar la solicitud.' });
  }
});

app.patch('/api/appointments/requests/:id', requireAuth, requireMechanic, async (req, res) => {
  const requestId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Identificador de solicitud no válido.' });
  }

  const allowedStatuses = new Set(['confirmado', 'rechazado', 'completado']);
  const requestedStatus = typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : '';
  const rejectionReason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  const finalPriceInput = req.body?.finalPrice;
  const finalPrice = requestedStatus === 'completado' ? Number.parseFloat(finalPriceInput) : null;

  if (!allowedStatuses.has(requestedStatus)) {
    return res.status(400).json({ error: 'Estado de solicitud no válido.' });
  }

  if (requestedStatus === 'rechazado') {
    if (!rejectionReason) {
      return res.status(400).json({ error: 'Debes indicar el motivo del rechazo.' });
    }
    if (rejectionReason.length > 500) {
      return res.status(400).json({ error: 'El motivo del rechazo no puede superar los 500 caracteres.' });
    }
  }

  try {
    const existing = db
      .prepare('SELECT status, scheduled_for, service, address FROM appointments WHERE id = ? AND mechanic_id = ? LIMIT 1')
      .get(requestId, req.session.userId);

    if (!existing) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }

    const normalizedExisting = existing.status ? existing.status.toLowerCase() : '';
    const serviceName = existing.service || '';

    const isSameStatus = normalizedExisting === requestedStatus;
    let canTransition = false;
    if (requestedStatus === 'completado') {
      canTransition = normalizedExisting === 'confirmado';
    } else if (requestedStatus === 'confirmado' || requestedStatus === 'rechazado') {
      canTransition = normalizedExisting === 'pendiente';
    }

    if (!isSameStatus && !canTransition) {
      return res
        .status(400)
        .json({ error: 'Solo puedes actualizar solicitudes pendientes o confirmadas.' });
    }

    if (requestedStatus === 'completado') {
      if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
        return res.status(400).json({ error: 'Debes ingresar el precio final del trabajo.' });
      }

      if (finalPrice < MINIMUM_COMPLETION_PRICE) {
        return res
          .status(400)
          .json({ error: `El precio no puede ser menor a ${MINIMUM_COMPLETION_PRICE}.` });
      }

      const minimumPrice = getServiceMinimumPrice(serviceName);
      if (Number.isFinite(minimumPrice) && finalPrice < minimumPrice) {
        return res
          .status(400)
          .json({ error: `El precio no puede ser menor al mínimo (${minimumPrice}).` });
      }

      const historicalAverage = getHistoricalAveragePrice(serviceName);
      if (Number.isFinite(historicalAverage) && historicalAverage > 0 && finalPrice < historicalAverage * 0.5) {
        return res
          .status(400)
          .json({ error: 'El precio está por debajo del 50% del promedio histórico.' });
      }

      const scheduledDate = existing?.scheduled_for ? new Date(existing.scheduled_for) : null;
      if (scheduledDate && !Number.isNaN(scheduledDate.getTime())) {
        const now = new Date();
        if (scheduledDate > now) {
          return res
            .status(400)
            .json({ error: 'No puedes finalizar una cita antes de la fecha programada.' });
        }
      }
    }

    if (!isSameStatus) {
      const fields = ['status = ?'];
      const params = [requestedStatus];

      if (requestedStatus === 'rechazado') {
        fields.push('rejection_reason = ?');
        params.push(rejectionReason);
      } else if (normalizedExisting === 'rechazado') {
        fields.push('rejection_reason = NULL');
      }

      fields.push('reschedule_reason = NULL', 'reschedule_requested_at = NULL');

      if (requestedStatus === 'completado') {
        fields.push('final_price = ?');
        fields.push('completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)');
        params.push(finalPrice);
      }

      db.prepare(`UPDATE appointments SET ${fields.join(', ')} WHERE id = ? AND mechanic_id = ?`)
        .run(...params, requestId, req.session.userId);
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

    if (requestedStatus === 'completado') {
      createCommissionRecord({
        appointmentId: updated.id,
        mechanicId: req.session.userId,
        service: updated.service,
        workPrice: finalPrice,
        category: serviceName,
      });
    }

    // 👉 si el nuevo estado es "confirmado", intentamos mandar correo al cliente
    if (requestedStatus === 'confirmado' && updated.client_email) {
      try {
        const fechaFormateada =
          formatNotificationDate(updated.scheduled_for, { includeTime: false }) ||
          updated.scheduled_for;
        const hora = extractSlotFromValue(updated.scheduled_for) || '';

        const workshop = getMechanicWorkshopSummary(req.session.userId);
        const nombreTaller = workshop?.name || 'tu taller en MechApp';

        await sendRequestAcceptedEmail({
          to: updated.client_email,
          nombreCliente: updated.client_name,
          nombreTaller,
          fecha: fechaFormateada,
          hora,
          direccion: updated.address,
          servicio: updated.service,
        });
      } catch (emailError) {
        console.error('Error enviando correo de solicitud aceptada:', emailError);
      }
    }
    // 👉 si el nuevo estado es "rechazado", avisamos al cliente por correo
    if (requestedStatus === 'rechazado' && updated.client_email) {
      try {
        const fechaFormateada =
          formatNotificationDate(updated.scheduled_for, { includeTime: false }) ||
          updated.scheduled_for;

        const workshop = getMechanicWorkshopSummary(req.session.userId);
        const nombreTaller = workshop?.name || 'tu taller en MechApp';

        await sendRequestRejectedEmail({
          to: updated.client_email,
          nombreCliente: updated.client_name,
          nombreTaller,
          fecha: fechaFormateada,
          servicio: updated.service,
          motivo: updated.rejection_reason,
        });
      } catch (emailError) {
        console.error('Error enviando correo de solicitud rechazada:', emailError);
      }
    }


    res.json({ request: mapAppointmentRequest(updated) });
  } catch (error) {
    console.error('Error actualizando la solicitud de cita', error);
    res.status(500).json({ error: 'No se pudo actualizar la solicitud de cita.' });
  }
});

app.get('/api/mechanic/commissions', requireAuth, requireMechanic, (req, res) => {
  try {
    const statusFilter = typeof req.query?.status === 'string' ? req.query.status.trim().toLowerCase() : '';

    const params = [req.session.userId];
    let query = `
      SELECT
        c.*, a.scheduled_for, a.service AS appointment_service, a.final_price
      FROM commissions c
      JOIN appointments a ON a.id = c.appointment_id
      WHERE c.mechanic_id = ?
    `;

    if (statusFilter) {
      query += ' AND LOWER(c.status) = LOWER(?)';
      params.push(statusFilter);
    }

    query += ' ORDER BY datetime(c.created_at) DESC';

    const rows = db.prepare(query).all(...params);
    const commissions = rows.map((row) =>
      mapCommission({ ...row, service: row.appointment_service || row.service })
    );

    res.json({ commissions });
  } catch (error) {
    console.error('Error obteniendo comisiones', error);
    res.status(500).json({ error: 'No se pudieron obtener las comisiones.' });
  }
});

app.post('/api/comisiones/:id/pagar', requireAuth, requireMechanic, (req, res) => {
  const commissionId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(commissionId) || commissionId <= 0) {
    return res.status(400).json({ error: 'Identificador de comisión no válido.' });
  }

  try {
    const commission = db
      .prepare(
        `SELECT c.*, a.scheduled_for, a.service AS appointment_service, a.final_price
         FROM commissions c
         JOIN appointments a ON a.id = c.appointment_id
         WHERE c.id = ? AND c.mechanic_id = ?`
      )
      .get(commissionId, req.session.userId);

    if (!commission) {
      return res.status(404).json({ error: 'Comisión no encontrada.' });
    }

    if ((commission.status || '').toLowerCase() === 'pagada') {
      return res.status(400).json({ error: 'Esta comisión ya está pagada.' });
    }

    db.prepare(`
      UPDATE commissions
         SET status = 'pagada',
             paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP)
       WHERE id = ? AND mechanic_id = ?
    `).run(commissionId, req.session.userId);

    const updated = db
      .prepare(
        `SELECT c.*, a.scheduled_for, a.service AS appointment_service, a.final_price
         FROM commissions c
         JOIN appointments a ON a.id = c.appointment_id
         WHERE c.id = ? AND c.mechanic_id = ?
         LIMIT 1`
      )
      .get(commissionId, req.session.userId);

    res.json({ commission: mapCommission({ ...updated, service: updated?.appointment_service }) });
  } catch (error) {
    console.error('Error pagando comisión', error);
    res.status(500).json({ error: 'No se pudo actualizar la comisión.' });
  }
});

app.post('/api/comisiones/:id/paypal', requireAuth, requireMechanic, async (req, res) => {
  const commissionId = Number.parseInt(req.params.id, 10);
  const { orderID } = req.body || {};

  if (!Number.isInteger(commissionId) || commissionId <= 0) {
    return res.status(400).json({ error: 'Identificador de comisión no válido.' });
  }

  if (!orderID) {
    return res.status(400).json({ error: 'orderID requerido' });
  }

  try {
    const commission = db
      .prepare(
        `SELECT c.*, a.scheduled_for, a.service AS appointment_service, a.final_price
         FROM commissions c
         JOIN appointments a ON a.id = c.appointment_id
         WHERE c.id = ? AND c.mechanic_id = ?
         LIMIT 1`
      )
      .get(commissionId, req.session.userId);

    if (!commission) {
      return res.status(404).json({ error: 'Comisión no encontrada.' });
    }

    const data = await capturePayPalOrder(orderID);
    const pu = data?.purchase_units?.[0];
    const cap = pu?.payments?.captures?.[0];

    const status = cap?.status || data?.status || 'COMPLETADO';
    const amount = cap?.amount?.value || pu?.amount?.value || null;
    const currency = cap?.amount?.currency_code || pu?.amount?.currency_code || null;
    const payerEmail = data?.payer?.email_address || null;

    db.prepare(`
      INSERT OR IGNORE INTO payments
        (provider, order_id, status, payer_email, amount_value, amount_currency, raw_json)
      VALUES ('paypal_commission', ?, ?, ?, ?, ?, ?)
    `).run(String(data.id), String(status), payerEmail, amount, currency, JSON.stringify(data));

    db.prepare(`
      UPDATE commissions
         SET status = 'pagada',
             paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP)
       WHERE id = ? AND mechanic_id = ?
    `).run(commissionId, req.session.userId);

    const updated = db
      .prepare(
        `SELECT c.*, a.scheduled_for, a.service AS appointment_service, a.final_price
         FROM commissions c
         JOIN appointments a ON a.id = c.appointment_id
         WHERE c.id = ? AND c.mechanic_id = ?
         LIMIT 1`
      )
      .get(commissionId, req.session.userId);

    res.json({
      commission: mapCommission({ ...updated, service: updated?.appointment_service }),
      payment: {
        orderId: data.id,
        status,
        amount,
        currency,
        payerEmail,
      },
    });
  } catch (error) {
    console.error('Error pagando comisión con PayPal', error);
    res.status(500).json({ error: 'No se pudo completar el pago en PayPal.' });
  }
});



function determineAutoFinalPrice(serviceName) {
  const minPrice = getServiceMinimumPrice(serviceName);
  const averagePrice = getHistoricalAveragePrice(serviceName);

  const candidates = [minPrice, averagePrice].filter((value) => Number.isFinite(value) && value > 0);
  if (candidates.length === 0) {
    return null;
  }

  return Math.max(...candidates);
}

function autoFinalizeOverdueAppointments() {
  try {
    const overdue = db
      .prepare(`
        SELECT id, mechanic_id, service
          FROM appointments
         WHERE status IN ('pendiente', 'confirmado')
           AND datetime(scheduled_for) <= datetime('now', '-48 hours')
      `)
      .all();

    overdue.forEach((appointment) => {
      const price = determineAutoFinalPrice(appointment.service);
      const workPrice = Number.isFinite(price) && price > 0 ? price : 0;

      db.prepare(`
        UPDATE appointments
           SET status = 'completado',
               final_price = COALESCE(?, final_price, 0),
               completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
         WHERE id = ?
           AND status IN ('pendiente', 'confirmado')
      `).run(workPrice, appointment.id);

      createCommissionRecord({
        appointmentId: appointment.id,
        mechanicId: appointment.mechanic_id,
        service: appointment.service,
        workPrice,
        category: appointment.service,
      });
    });
  } catch (error) {
    console.error('Error finalizando citas automáticamente', error);
  }
}

const AUTO_FINALIZE_INTERVAL_MS = 30 * 60 * 1000;
setInterval(autoFinalizeOverdueAppointments, AUTO_FINALIZE_INTERVAL_MS);
autoFinalizeOverdueAppointments();


// ====== ENDPOINTS PayPal ======
// Confirmar en backend y guardar en BD
// ====== ENDPOINT PayPal: CAPTURAR y guardar ======
app.post('/api/paypal/capture', async (req, res) => {
  try {
    const { orderID, appointmentId } = req.body || {};
    if (!orderID) return res.status(400).json({ error: 'orderID requerido' });

    // 1) Capturar en PayPal (esto hace el cobro real en sandbox)
    const data = await capturePayPalOrder(orderID);

    // 2) Extraer datos útiles
    const pu = data?.purchase_units?.[0];
    const cap = pu?.payments?.captures?.[0];

    const status = cap?.status || data?.status || 'COMPLETADO';
    const amount = cap?.amount?.value || pu?.amount?.value || null;
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

    let appointmentUpdated = false;
    const appointmentIdNumber = Number(appointmentId);

    if (Number.isFinite(appointmentIdNumber)) {
      // Marcamos la cita como abono pagado y confirmada (tal como ya lo tenías)
      const result = db
        .prepare(
          `UPDATE appointments
           SET abono_pagado = 1,
               status = CASE
                 WHEN LOWER(COALESCE(status, '')) IN ('pendiente', 'confirmado', '') THEN 'confirmado'
                 ELSE status
               END
           WHERE id = ?`
        )
        .run(appointmentIdNumber);

      appointmentUpdated = result.changes > 0;

      // 👉 Si se actualizó la cita, intentamos avisar al mecánico por correo
      if (appointmentUpdated) {
        try {
          const row = db
            .prepare(
              `SELECT
                 a.id,
                 a.service,
                 a.scheduled_for,
                 m.name AS mechanic_name,
                 m.email AS mechanic_email,
                 u.name AS client_name
               FROM appointments a
               JOIN users m ON m.id = a.mechanic_id
               JOIN users u ON u.id = a.client_id
               WHERE a.id = ?
               LIMIT 1`
            )
            .get(appointmentIdNumber);

          if (row && row.mechanic_email) {
            // Usamos el mismo formateador de fechas que ya tienes
            const fechaFormateada =
              formatNotificationDate(row.scheduled_for, { includeTime: true }) ||
              row.scheduled_for;

            await sendDepositPaidEmailToMechanic({
              to: row.mechanic_email,
              nombreMecanico: row.mechanic_name,
              nombreCliente: row.client_name,
              servicio: row.service,
              fecha: fechaFormateada,
              monto: amount,
              moneda: currency,
            });
          }
        } catch (emailError) {
          console.error('Error enviando correo de abono pagado al mecánico:', emailError);
          // No rompemos la respuesta al front si falla el correo
        }
      }
    }

    // 4) Responder al front
    res.json({
      orderId: data.id,
      status,
      amount,
      currency,
      payerEmail,
      appointmentUpdated,
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

app.get('/api/admin/commissions/pending', requireAuth, requireAdmin, (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT
          c.*, a.scheduled_for, a.service AS appointment_service, a.final_price,
          u.name AS mechanic_name, u.email AS mechanic_email
         FROM commissions c
         JOIN users u ON u.id = c.mechanic_id
         JOIN appointments a ON a.id = c.appointment_id
        WHERE LOWER(c.status) = 'pendiente'
        ORDER BY datetime(c.created_at) DESC`
      )
      .all();

    const pending = rows.map((row) => ({
      ...mapCommission({ ...row, service: row.appointment_service || row.service }),
      mechanicName: row.mechanic_name,
      mechanicEmail: row.mechanic_email,
    }));

    res.json({ pending });
  } catch (error) {
    console.error('Error obteniendo comisiones pendientes para administración', error);
    res.status(500).json({ error: 'No se pudieron obtener las cotizaciones pendientes.' });
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
// Restablecer contraseña usando token (flujo "olvidé mi contraseña")
app.post('/api/password/reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};

    if (!token || !newPassword) {
      return res
        .status(400)
        .json({ error: 'Faltan el token y/o la nueva contraseña.' });
    }

    if (String(newPassword).length < 8) {
      return res
        .status(400)
        .json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
    }

    // Buscar usuario por token
    const user = db
      .prepare(
        `SELECT id, reset_token_expires
         FROM users
         WHERE reset_token = ?`
      )
      .get(token);

    if (!user) {
      return res
        .status(400)
        .json({ error: 'El enlace de restablecimiento no es válido o ya fue usado.' });
    }

    // Validar que no esté expirado
    const expires = user.reset_token_expires
      ? new Date(user.reset_token_expires)
      : null;

    if (!expires || Number.isNaN(expires.getTime()) || expires < new Date()) {
      return res
        .status(400)
        .json({ error: 'El enlace de restablecimiento ha expirado. Solicita uno nuevo.' });
    }

    // Hashear nueva contraseña
    const hashedPassword = await bcrypt.hash(String(newPassword), 10);

    // Actualizar contraseña y limpiar token
    db.prepare(
      `UPDATE users
       SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL
       WHERE id = ?`
    ).run(hashedPassword, user.id);

    return res.json({ message: 'Contraseña actualizada correctamente.' });
  } catch (error) {
    console.error('Error en /api/password/reset', error);
    res.status(500).json({ error: 'Ocurrió un error al restablecer la contraseña.' });
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
