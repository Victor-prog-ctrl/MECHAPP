// mailer.js
const nodemailer = require("nodemailer");
const { google } = require("googleapis");

// 👉 Pega tus datos reales aquí:
const GMAIL_USER = "ke.aviles@duocuc.cl";
const CLIENT_ID = "555481087487-7frp39qun9doobe34kq7t8pdem3kfoo7.apps.googleusercontent.com";
const CLIENT_SECRET = "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";
const REFRESH_TOKEN = "1//0hbqjr_XbK0HUCgYIARAAGBESNwF-L9Iroq-EzbUAKvmWvWS17welHv7OqIebSUHT0gZItV1sUZPect9Ahp_ck5qzghoXfuAvJ8Q";

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  "urn:ietf:wg:oauth:2.0:oob" // el mismo redirect que usaste antes
);

oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

async function baseSendMail({ to, subject, html }) {
  // consigue un access_token fresco cada vez
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

// ----------------- CORREOS ESPECÍFICOS -----------------

// 1) Bienvenida al crear cuenta
async function sendWelcomeEmail({ to, nombre }) {
  return baseSendMail({
    to,
    subject: "¡Bienvenido a MechApp!",
    html: `
      <h2>Hola ${nombre || ""} 👋</h2>
      <p>Gracias por registrarte en <strong>MechApp</strong>.</p>
      <p>Desde ahora podrás agendar citas con talleres de confianza y gestionar tus solicitudes desde tu perfil.</p>
      <p>Si no fuiste tú, puedes ignorar este correo.</p>
      <p style="margin-top:16px;font-size:12px;color:#6b7280">
        © ${new Date().getFullYear()} MechApp
      </p>
    `,
  });
}

// 2) Solicitud aceptada por el mecánico
async function sendRequestAcceptedEmail({
  to,
  nombreCliente,
  nombreTaller,
  fecha,
  hora,
  direccion,
}) {
  return baseSendMail({
    to,
    subject: "Tu solicitud en MechApp fue aceptada ✅",
    html: `
      <h2>Hola ${nombreCliente || ""}</h2>
      <p>Tu solicitud fue <strong>aceptada</strong> por el taller <strong>${nombreTaller}</strong>.</p>
      <p><strong>Detalles de la cita:</strong></p>
      <ul>
        <li><strong>Fecha:</strong> ${fecha}</li>
        <li><strong>Hora:</strong> ${hora}</li>
        <li><strong>Dirección:</strong> ${direccion}</li>
      </ul>
      <p>Recuerda llegar unos minutos antes y llevar toda la información de tu vehículo.</p>
      <p style="margin-top:16px;font-size:12px;color:#6b7280">
        Este mensaje fue enviado automáticamente por MechApp.
      </p>
    `,
  });
}

module.exports = {
  sendWelcomeEmail,
  sendRequestAcceptedEmail,
};
