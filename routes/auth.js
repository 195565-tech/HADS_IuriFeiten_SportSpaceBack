// backend/routes/auth.js
const express = require("express");
const jwt = require("jsonwebtoken");
const knex = require("../db/knex");
const bcrypt = require("bcryptjs");

const router = express.Router();

// Gera token JWT
function generateToken(user) {
if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET não definido");
return jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "60d" });
}

// Middleware para autenticação (busca o token no cabeçalho Authorization)
async function authenticateToken(req, res, next) {
// Padrão JWT: Extrai o token de 'Authorization: Bearer <token>'
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

// ===================================
// 🚀 ROTA: CADASTRO (REGISTER)
// ===================================
router.post("/register", async (req, res) => {
try {
 const { nome, email, senha } = req.body;
 if (!nome || !email || !senha) return res.status(400).json({ error: "Nome, email e senha são obrigatórios" });

 // 1. Verifica se o usuário já existe
 const existingUser = await knex("user_profiles").where({ user_id: email }).first();
 if (existingUser) {
  return res.status(409).json({ error: "Email já cadastrado." });
 }

 // 2. Gera o hash da senha
 const salt = await bcrypt.genSalt(10);
 const passwordHash = await bcrypt.hash(senha, salt);
  
 // 3. Insere o novo usuário (user_type 'user' por padrão)
 const [newUser] = await knex("user_profiles")
  .insert({ 
  user_id: email, 
  nome: nome,
  password_hash: passwordHash,
  user_type: 'user' // Padrão: usuário comum
  })
  .returning('*');

 // 4. Gera o token e retorna para o frontend (sem cookie)
 const token = generateToken({ user_id: newUser.user_id, user_type: newUser.user_type });
  
 // Remove o hash da senha antes de enviar ao frontend
 delete newUser.password_hash;

 // RETORNA O TOKEN NO JSON DA RESPOSTA
 res.status(201).json({ success: true, user: newUser, token });
} catch (err) {
 console.error(err);
 res.status(500).json({ error: "Erro interno no cadastro" });
}
});

// Login
router.post("/login", async (req, res) => {
try {
 const { email, senha } = req.body;
 if (!email || !senha) return res.status(400).json({ error: "Email e senha são obrigatórios" });

 const user = await knex("user_profiles").where({ user_id: email }).first();
 if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

 const validPassword = await bcrypt.compare(senha, user.password_hash);
 if (!validPassword) return res.status(401).json({ error: "Senha incorreta" });

 // Gera o token
 const token = generateToken({ user_id: user.user_id, user_type: user.user_type });

 delete user.password_hash; // Remove o hash
 
 // RETORNA O TOKEN NO JSON DA RESPOSTA
 res.json({ success: true, user, token });
} catch (err) {
 console.error(err);
 res.status(500).json({ error: "Erro interno no login" });
}
});

// Recuperação de senha (simulação)
router.post("/recover", async (req, res) => {
try {
 const { email } = req.body;
 if (!email) return res.status(400).json({ error: "Email é obrigatório" });

 const user = await knex("user_profiles").where({ user_id: email }).first();
 if (!user) {
  // Por segurança, não revelamos se o email existe ou não
  return res.json({ message: "Se o email estiver cadastrado, você receberá instruções de recuperação" });
 }

 // Simulação: apenas retorna mensagem de sucesso
 res.json({ message: "Email de recuperação enviado com sucesso" });
} catch (err) {
 console.error(err);
 res.status(500).json({ error: "Erro interno na recuperação" });
}
});

// Rota /me
router.get("/me", authenticateToken, async (req, res) => {
try {
 const user = await knex("user_profiles").where({ user_id: req.user.user_id }).first();
 if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
 delete user.password_hash; // Remove o hash
 res.json({ user });
} catch (err) {
 console.error(err);
 res.status(500).json({ error: "Erro ao buscar usuário" });
}
});

// Logout (Apenas retorna sucesso, o frontend deve descartar o token localmente)
router.post("/logout", (req, res) => {
// Não há cookie para limpar.
res.json({ success: true, message: "Sessão encerrada (Frontend deve descartar o token)" });
});

module.exports = router;