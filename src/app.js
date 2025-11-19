const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth');

const app = express();

// CORS - permitir requisições do frontend
app.use(cors({
  origin: ['https://main.dlm5jb4lw8ys1.amplifyapp.com', 'http://localhost:5173'],
  credentials: true,
}));

// Middleware para processar JSON
app.use(express.json());
app.use(cookieParser());

// Rota de teste
app.get('/api/test', (req, res) => {
  res.json({ message: 'API funcionando' });
});

// Rotas de autenticação
app.use('/api/auth', authRoutes);

module.exports = app;
