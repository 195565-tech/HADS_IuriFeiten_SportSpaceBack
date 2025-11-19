// backend/utils/emailService.js
const nodemailer = require("nodemailer");

// Configurar transportador SMTP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // true para 465, false para 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Função para enviar e-mail de recuperação
async function sendPasswordResetEmail(nome, email, resetLink) {
  const mailOptions = {
    from: `"SportSpace" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Recuperação de Senha - SportSpace",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { padding: 30px; background-color: #f9fafb; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white !important; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          .warning { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .code-box { background-color: #e5e7eb; padding: 10px; border-radius: 4px; word-break: break-all; font-family: monospace; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🏀 SportSpace</h1>
          </div>
          <div class="content">
            <h2>Olá, ${nome}!</h2>
            <p>Você solicitou a recuperação de senha da sua conta SportSpace.</p>
            <p>Clique no botão abaixo para redefinir sua senha:</p>
            <div style="text-align: center;">
              <a href="${resetLink}" class="button">Redefinir Senha</a>
            </div>
            <p>Ou copie e cole este link no seu navegador:</p>
            <div class="code-box">${resetLink}</div>
            <div class="warning">
              <strong>⚠️ Importante:</strong>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Este link é válido por <strong>30 minutos</strong></li>
                <li>Se você não solicitou esta recuperação, ignore este e-mail</li>
                <li>Nunca compartilhe este link com outras pessoas</li>
              </ul>
            </div>
          </div>
          <div class="footer">
            <p>Este é um e-mail automático. Por favor, não responda.</p>
            <p>&copy; 2025 SportSpace. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] ✅ Enviado para ${email}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[EMAIL] ❌ Falha ao enviar para ${email}:`, error.message);
    throw error;
  }
}

// Testar conexão SMTP
async function testConnection() {
  try {
    await transporter.verify();
    console.log("✅ Conexão SMTP estabelecida com sucesso");
    console.log(`📧 Emails serão enviados de: ${process.env.SMTP_USER}`);
    return true;
  } catch (error) {
    console.error("❌ Erro na conexão SMTP:", error.message);
    console.error("Verifique suas credenciais SMTP no arquivo .env");
    return false;
  }
}

module.exports = {
  sendPasswordResetEmail,
  testConnection,
};
