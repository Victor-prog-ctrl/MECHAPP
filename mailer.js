// mailer.js
const nodemailer = require("nodemailer");
const { google } = require("googleapis");

// ====================== PLANTILLAS HTML ======================

function buildWelcomeEmail(name) {
  const safeName = name || "cliente";

  return `
  <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background-color:#f3f4f6;padding:24px;">
    <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(15,23,42,0.15);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <img
          src="https://raw.githubusercontent.com/Victor-prog-ctrl/MECHAPP/refs/heads/main/assets/logo-rojo.png"
          alt="MechApp"
          style="height:32px;width:auto;display:block;border-radius:8px;"
        />
        <div style="font-weight:700;font-size:18px;">MechApp</div>
      </div>

   <h1 style="margin:0 0 12px;font-size:22px;color:#111827;">
  ¡Bienvenido a MechApp, ${safeName}! 👋
</h1>

<p style="margin:0 0 8px;color:#4b5563;">
  Gracias por registrarte en <strong>MechApp</strong>.
</p>

<p style="margin:0 0 8px;color:#4b5563;">
  Desde ahora podrás:
</p>

<ul style="margin:0 0 8px 18px;color:#4b5563;padding:0;">
  <li>Encontrar talleres de confianza cerca de ti.</li>
  <li>Agendar citas por día y hora.</li>
  <li>Revisar el estado de tus solicitudes.</li>
</ul>

<p style="margin:0 0 8px;color:#4b5563;">
  Y si eres <strong>mecánico registrado</strong>, podrás crear el perfil de tu taller,
  gestionar tus citas y recibir nuevos clientes desde la plataforma.
</p>

<p style="margin:16px 0 0;color:#6b7280;font-size:12px;">
  Si no fuiste tú quien creó esta cuenta, puedes ignorar este correo.
</p>

<p style="margin:24px 0 0;color:#9ca3af;font-size:12px;text-align:center;">
  © ${new Date().getFullYear()} MechApp
</p>

    </div>
  </div>`;
}

function buildAppointmentConfirmedEmail({
  clientName,
  service,
  dateLabel,
  address,
  workshopName,
}) {
  const safeName = clientName || "cliente";

  return `
  <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background-color:#f3f4f6;padding:24px;">
    <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(15,23,42,0.15);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <img
          src="https://raw.githubusercontent.com/Victor-prog-ctrl/MECHAPP/refs/heads/main/assets/logo-rojo.png"
          alt="MechApp"
          style="height:32px;width:auto;display:block;border-radius:8px;"
        />
        <div style="font-weight:700;font-size:18px;">MechApp</div>
      </div>

      <h1 style="margin:0 0 12px;font-size:22px;color:#111827;">
        Tu cita fue confirmada ✅
      </h1>

      <p style="margin:0 0 8px;color:#4b5563;">
        Hola ${safeName}, tu solicitud en <strong>MechApp</strong> ha sido
        <strong>aceptada</strong> por el taller ${workshopName || "seleccionado"}.
      </p>

      <div style="margin-top:12px;padding:12px;border-radius:12px;background-color:#f8fafc;border:1px solid #e2e8f0;">
        <p style="margin:0 0 6px;color:#4b5563;">
          <strong>Servicio:</strong> ${service || "Sin detalle"}
        </p>
        <p style="margin:0 0 6px;color:#4b5563;">
          <strong>Fecha y hora:</strong> ${dateLabel || "Por confirmar"}
        </p>
        <p style="margin:0;color:#4b5563;">
          <strong>Dirección:</strong> ${address || "Revisa tu perfil en MechApp"}
        </p>
      </div>

      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">
        Si necesitas modificar o cancelar tu cita, puedes hacerlo desde tu perfil en MechApp.
      </p>

      <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;text-align:center;">
        © ${new Date().getFullYear()} MechApp
      </p>
    </div>
  </div>`;
}

// 👉 NUEVA plantilla: nueva solicitud para el mecánico
function buildNewAppointmentRequestEmail({
  mechanicName,
  clientName,
  service,
  dateLabel,
}) {
  const safeMechanic = mechanicName || "mecánico";
  const safeClient = clientName || "un cliente";

  return `
  <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background-color:#f3f4f6;padding:24px;">
    <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(15,23,42,0.15);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <img
          src="https://raw.githubusercontent.com/Victor-prog-ctrl/MECHAPP/refs/heads/main/assets/logo-rojo.png"
          alt="MechApp"
          style="height:32px;width:auto;display:block;border-radius:8px;"
        />
        <div style="font-weight:700;font-size:18px;">MechApp</div>
      </div>

      <h1 style="margin:0 0 12px;font-size:22px;color:#111827;">
        Nueva solicitud de cita pendiente 🕒
      </h1>

      <p style="margin:0 0 8px;color:#4b5563;">
        Hola ${safeMechanic}, tienes una <strong>nueva solicitud de cita</strong> en MechApp.
      </p>

      <div style="margin-top:12px;padding:12px;border-radius:12px;background-color:#f8fafc;border:1px solid #e2e8f0;">
        <p style="margin:0 0 6px;color:#4b5563;">
          <strong>Cliente:</strong> ${safeClient}
        </p>
        <p style="margin:0 0 6px;color:#4b5563;">
          <strong>Servicio solicitado:</strong> ${service || "Sin detalle"}
        </p>
        <p style="margin:0 0 6px;color:#4b5563;">
          <strong>Fecha preferida:</strong> ${dateLabel || "Por definir"}
        </p>
      </div>

      <p style="margin:16px 0 0;color:#4b5563;">
        Ingresa a tu perfil de <strong>MechApp</strong> para <strong>aceptar o rechazar</strong> esta solicitud
        y revisar los detalles completos de la cita.
      </p>

      <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;text-align:center;">
        © ${new Date().getFullYear()} MechApp
      </p>
    </div>
  </div>`;
}

// 👉 Plantilla para rechazo de solicitud
function buildRequestRejectedEmail({ clientName, service, dateLabel }) {
  const safeName = clientName || "cliente";

  return `
  <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background-color:#f3f4f6;padding:24px;">
    <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(15,23,42,0.15);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <img
          src="https://raw.githubusercontent.com/Victor-prog-ctrl/MECHAPP/refs/heads/main/assets/logo-rojo.png"
          alt="MechApp"
          style="height:32px;width:auto;display:block;border-radius:8px;"
        />
        <div style="font-weight:700;font-size:18px;">MechApp</div>
      </div>

      <h1 style="margin:0 0 12px;font-size:22px;color:#111827;">
        Tu solicitud fue rechazada ❌
      </h1>

      <p style="margin:0 0 8px;color:#4b5563;">
        Hola ${safeName}, el taller no pudo aceptar tu solicitud para
        <strong>${service || "tu servicio"}</strong>.
      </p>

      ${dateLabel
      ? `<p style="margin:0 0 8px;color:#4b5563;">Fecha solicitada: ${dateLabel}</p>`
      : ""
    }

      <p style="margin:0 0 8px;color:#4b5563;">
        Te invitamos a ingresar nuevamente a MechApp para elegir otra fecha u otro taller disponible.
      </p>

      <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;text-align:center;">
        © ${new Date().getFullYear()} MechApp
      </p>
    </div>
  </div>`;
}

// 👉 Plantilla para abono pagado (correo al mecánico)
function buildDepositPaidEmail({ mechanicName, clientName, service, dateLabel }) {
  const safeMechanic = mechanicName || "mecánico";
  const safeClient = clientName || "un cliente";

  return `
  <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background-color:#f3f4f6;padding:24px;">
    <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(15,23,42,0.15);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <img
          src="https://raw.githubusercontent.com/Victor-prog-ctrl/MECHAPP/refs/heads/main/assets/logo-rojo.png"
          alt="MechApp"
          style="height:32px;width:auto;display:block;border-radius:8px;"
        />
        <div style="font-weight:700;font-size:18px;">MechApp</div>
      </div>

      <h1 style="margin:0 0 12px;font-size:22px;color:#111827;">
        Un cliente pagó el abono 💳
      </h1>

      <p style="margin:0 0 8px;color:#4b5563;">
        Hola ${safeMechanic}, ${safeClient} ha pagado el <strong>abono de su cita</strong> en MechApp.
      </p>

      <div style="margin-top:12px;padding:12px;border-radius:12px;background-color:#f8fafc;border:1px solid #e2e8f0;">
        <p style="margin:0 0 6px;color:#4b5563;">
          <strong>Servicio:</strong> ${service || "Sin detalle"}
        </p>
        <p style="margin:0 0 6px;color:#4b5563;">
          <strong>Fecha de la cita:</strong> ${dateLabel || "Por confirmar"}
        </p>
      </div>

      <p style="margin:16px 0 0;color:#4b5563;">
        Ingresa a tu perfil de MechApp para revisar los detalles de la cita y prepararte para la atención.
      </p>

      <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;text-align:center;">
        © ${new Date().getFullYear()} MechApp
      </p>
    </div>
  </div>`;
}

// ====================== CONFIG GMAIL OAuth2 ======================

const GMAIL_USER = "ke.aviles@duocuc.cl";
const CLIENT_ID =
  "555481087487-7frp39qun9doobe34kq7t8pdem3kfoo7.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const REFRESH_TOKEN =
  "1//0hbqjr_XbK0HUCgYIARAAGBESNwF-L9Iroq-EzbUAKvmWvWS17welHv7OqIebSUHT0gZItV1sUZPect9Ahp_ck5qzghoXfuAvJ8Q";

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  "urn:ietf:wg:oauth:2.0:oob"
);

oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

// Envío base reutilizable
async function baseSendMail({ to, subject, html }) {
  const { token } = await oAuth2Client.getAccessToken();

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: GMAIL_USER,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
      accessToken: token,
    },
  });

  const info = await transporter.sendMail({
    from: `"MechApp" <${GMAIL_USER}>`,
    to,
    subject,
    html,
  });

  console.log("✉️ Correo enviado:", info.messageId);
  return info;
}

// ====================== CORREOS ESPECÍFICOS ======================

// 1) Bienvenida al crear cuenta
async function sendWelcomeEmail({ to, nombre }) {
  const html = buildWelcomeEmail(nombre);

  return baseSendMail({
    to,
    subject: "¡Bienvenido a MechApp!",
    html,
  });
}

// 2) Solicitud aceptada por el mecánico (correo al cliente)
async function sendRequestAcceptedEmail({
  to,
  nombreCliente,
  nombreTaller,
  fecha,
  hora,
  direccion,
  servicio,
}) {
  const dateLabel = fecha
    ? hora
      ? `${fecha} a las ${hora}`
      : fecha
    : hora || "Por definir";

  const html = buildAppointmentConfirmedEmail({
    clientName: nombreCliente,
    service: servicio,
    dateLabel,
    address: direccion,
    workshopName: nombreTaller,
  });

  return baseSendMail({
    to,
    subject: "Tu solicitud fue aceptada ✅",
    html,
  });
}

// 3) Solicitud rechazada por el mecánico (correo al cliente)
async function sendRequestRejectedEmail({
  to,
  nombreCliente,
  servicio,
  fecha,
  hora,
}) {
  const dateLabel = fecha
    ? hora
      ? `${fecha} a las ${hora}`
      : fecha
    : hora || "Por definir";

  const html = buildRequestRejectedEmail({
    clientName: nombreCliente,
    service: servicio,
    dateLabel,
  });

  return baseSendMail({
    to,
    subject: "Tu solicitud fue rechazada ❌",
    html,
  });
}

// 4) Abono pagado (correo al mecánico)
async function sendDepositPaidEmail({
  to,
  nombreMecanico,
  nombreCliente,
  servicio,
  fecha,
  hora,
}) {
  const dateLabel = fecha
    ? hora
      ? `${fecha} a las ${hora}`
      : fecha
    : hora || "Por definir";

  const html = buildDepositPaidEmail({
    mechanicName: nombreMecanico,
    clientName: nombreCliente,
    service: servicio,
    dateLabel,
  });

  return baseSendMail({
    to,
    subject: "Un cliente pagó el abono 💳",
    html,
  });
}

// 5) NUEVA solicitud de cita pendiente (correo al mecánico)
async function sendNewAppointmentRequestEmail({
  to,
  nombreMecanico,
  nombreCliente,
  servicio,
  fecha,
  hora,
}) {
  const dateLabel = fecha
    ? hora
      ? `${fecha} a las ${hora}`
      : fecha
    : hora || "Por definir";

  const html = buildNewAppointmentRequestEmail({
    mechanicName: nombreMecanico,
    clientName: nombreCliente,
    service: servicio,
    dateLabel,
  });

  return baseSendMail({
    to,
    subject: "Tienes una nueva solicitud de cita 🕒",
    html,
  });
}

// ====================== EXPORTS ======================

module.exports = {
  buildWelcomeEmail,
  buildAppointmentConfirmedEmail,
  sendWelcomeEmail,
  sendRequestAcceptedEmail,
  sendRequestRejectedEmail,
  sendDepositPaidEmail,
  sendNewAppointmentRequestEmail,
};
