//Mapeamento das rotas
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('../routes/auth');
const userRoutes = require('../routes/users');
const locaisRoutes = require('../routes/locais');
const reservasRoutes = require('../routes/reservas');
const notificacoesRoutes = require('../routes/notificacoes');

const app = express();

app.use(cors({
  origin: [
    'https://main.dd96lrvrtfaq0.amplifyapp.com',
    'https://main.dlm5jb4lw8ys1.amplifyapp.com',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400
}));

app.options('*', cors());

app.use(express.json());

// Rota de teste
app.get('/api/test', (req, res) => {
  res.json({ message: 'API funcionando' });
});

// ✅ TODAS as rotas configuradas
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', locaisRoutes);
app.use('/api', reservasRoutes);
app.use('/api', notificacoesRoutes);

module.exports = app;
