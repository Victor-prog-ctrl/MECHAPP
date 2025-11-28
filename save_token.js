const { google } = require("googleapis");

const oAuth2Client = new google.auth.OAuth2(
  "555481087487-7frp39qun9doobe34kq7t8pdem3kfoo7.apps.googleusercontent.com",
  "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",
  "urn:ietf:wg:oauth:2.0:oob"
);

// 👇 pega aquí el código que te dio Google (entre comillas)
const CODE = "4/1Ab32j915D2PfAPIZvzLTsus5I8iKOHUUR-CQPFXjrzQIJpB1rVB76qLrQyM";

(async () => {
  try {
    const { tokens } = await oAuth2Client.getToken(CODE);
    console.log("✅ Tokens obtenidos:");
    console.log(tokens);
  } catch (err) {
    console.error("❌ Error al obtener tokens:", err);
  }
})();
