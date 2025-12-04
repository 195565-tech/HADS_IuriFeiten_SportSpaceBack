//gera token para login, tudo que envolve autenticação de usuário passa por aqui
// backend/routes/auth.js
const { sendPasswordResetEmail } = require("../utils/emailService");
const express = require("express");
const jwt = require("jsonwebtoken");
const knex = require("../db/knex");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const router = express.Router();

// Configuração de rate limiting para recuperação de senha
const forgotPasswordLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 5, // máximo de 5 requisições
  message: { error: "Muitas tentativas. Tente novamente em 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log(`[BLOQUEIO] IP ${req.ip} bloqueado por tentativas excessivas`);
    res.status(429).json({
      error: "Muitas tentativas de recuperação. Tente novamente em 15 minutos."
    });
  }
});

// Gera token JWT
function generateToken(user) {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET não definido");
  return jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "60d" });
}

// Middleware para autenticação
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 

  if (!token) {
    return res.status(401).json({ error: "Não autenticado: Token 'Bearer' ausente" });
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    req.user = user;
    next();
  } catch (err) {
    console.error("Token inválido:", err);
    res.status(403).json({ error: "Token inválido ou expirado" });
  }
}

// Função para validar força da senha
function validatePassword(password) {
  const errors = [];
  
  if (password.length < 8) {
    errors.push("Mínimo de 8 caracteres");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Pelo menos uma letra maiúscula");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Pelo menos uma letra minúscula");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Pelo menos um número");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push("Pelo menos um caractere especial");
  }
  
  return errors;
}

// ===================================
// ROTA: CADASTRO (REGISTER)
// ===================================
router.post("/register", async (req, res) => {
  try {
    const { nome, email, senha, user_type } = req.body;
    if (!nome || !email || !senha) {
      return res.status(400).json({ error: "Nome, email e senha são obrigatórios" });
    }

    // Validação da senha
    const passwordErrors = validatePassword(senha);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ 
        error: "Senha não atende aos requisitos", 
        details: passwordErrors 
      });
    }

    const existingUser = await knex("user_profiles").where({ user_id: email }).first();
    if (existingUser) {
      return res.status(409).json({ error: "Email já cadastrado." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(senha, salt);

    const tipo = user_type === 'owner' ? 'owner' : 'user';

    const [newUser] = await knex("user_profiles")
      .insert({
        user_id: email,
        nome,
        password_hash: passwordHash,
        user_type: tipo
      })
      .returning('*');

    const token = generateToken({ user_id: newUser.user_id, user_type: newUser.user_type });

    delete newUser.password_hash;
    res.status(201).json({ success: true, user: newUser, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno no cadastro" });
  }
});

// ===================================
// ROTA: LOGIN
// ===================================
router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ error: "Email e senha são obrigatórios" });

    const user = await knex("user_profiles").where({ user_id: email }).first();
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    const validPassword = await bcrypt.compare(senha, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: "Senha incorreta" });

    const token = generateToken({ user_id: user.user_id, user_type: user.user_type });

    delete user.password_hash;
    res.json({ success: true, user, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno no login" });
  }
});

// ===================================
// ROTA: SOLICITAR RECUPERAÇÃO DE SENHA
// ===================================
router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email é obrigatório" });
    }

    // Log de auditoria
    console.log(`[RECUPERAÇÃO] Solicitação de: ${email} - IP: ${req.ip} - ${new Date().toISOString()}`);

    const user = await knex("user_profiles").where({ user_id: email }).first();
    
    // Sempre retorna mensagem genérica (RN01)
    const genericMessage = "Se o e-mail informado estiver cadastrado, você receberá instruções de recuperação.";
    
    if (!user) {
      // Log sem revelar que o usuário não existe
      console.log(`[RECUPERAÇÃO] Email não encontrado (não revelado ao cliente): ${email}`);
      return res.json({ message: genericMessage });
    }

    // Gera token seguro (RN02)
    const resetToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos

    // Invalida tokens antigos do mesmo usuário (RN02)
    await knex("password_resets")
      .where({ user_id: user.user_id })
      .update({ used: true });

    // Insere novo token
    await knex("password_resets").insert({
      user_id: user.user_id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      used: false
    });

    // Gerar link de recuperação
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    console.log(`[RECUPERAÇÃO] Link gerado para ${email}: ${resetLink}`);
    console.log(`[RECUPERAÇÃO] Token expira em: ${expiresAt.toISOString()}`);
    
    // Enviar e-mail
    try {
      await sendPasswordResetEmail(user.nome, email, resetLink);
      console.log(`[RECUPERAÇÃO] ✅ E-mail enviado com sucesso para: ${email}`);
    } catch (emailError) {
      console.error(`[RECUPERAÇÃO] ❌ Erro ao enviar e-mail:`, emailError.message);
      // Não revelar erro ao usuário por segurança
    }

    res.json({ message: genericMessage });
  } catch (err) {
    console.error("[ERRO RECUPERAÇÃO]", err);
    res.status(500).json({ error: "Erro ao processar recuperação de senha" });
  }
});

// ===================================
// ROTA: REDEFINIR SENHA
// ===================================
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: "Token e nova senha são obrigatórios" });
    }

    // Validação da senha (RN03)
    const passwordErrors = validatePassword(newPassword);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ 
        error: "Senha não atende aos requisitos", 
        details: passwordErrors 
      });
    }

    // Hash do token recebido
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Busca token no banco (RN02 e RN06)
    const resetRecord = await knex("password_resets")
      .where({ token_hash: tokenHash, used: false })
      .andWhere("expires_at", ">", new Date())
      .first();

    if (!resetRecord) {
      console.log(`[RESET] Token inválido ou expirado: ${token.substring(0, 10)}...`);
      return res.status(400).json({ 
        error: "O link de redefinição de senha expirou ou é inválido. Solicite novamente." 
      });
    }

    // Busca usuário
    const user = await knex("user_profiles")
      .where({ user_id: resetRecord.user_id })
      .first();

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    // Criptografa nova senha (RN03)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Atualiza senha
    await knex("user_profiles")
      .where({ user_id: user.user_id })
      .update({ password_hash: passwordHash });

    // Invalida o token (RN02)
    await knex("password_resets")
      .where({ id: resetRecord.id })
      .update({ used: true });

    // Log de auditoria (RN05)
    console.log(`[RESET] Senha redefinida com sucesso para: ${user.user_id} - ${new Date().toISOString()}`);

    res.json({ message: "Senha redefinida com sucesso." });
  } catch (err) {
    console.error("[ERRO RESET]", err);
    res.status(500).json({ error: "Erro ao redefinir senha" });
  }
});

// ===================================
// ROTA: /me
// ===================================
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await knex("user_profiles").where({ user_id: req.user.user_id }).first();
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    delete user.password_hash;
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar usuário" });
  }
});

// ===================================
// ROTA: LOGOUT
// ===================================
router.post("/logout", (req, res) => {
  res.json({ success: true, message: "Sessão encerrada (Frontend deve descartar o token)" });
});

module.exports = router;
