const { google } = require("googleapis");

const oAuth2Client = new google.auth.OAuth2(
  "555481087487-7frp39qun9doobe34kq7t8pdem3kfoo7.apps.googleusercontent.com",
  "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",
  "urn:ietf:wg:oauth:2.0:oob"
);

const url = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  scope: ["https://mail.google.com/"],
});

console.log("👉 Abre este link y acepta:");
console.log(url);
