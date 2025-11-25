require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const locaisRoutes = require('./routes/locais');
const reservasRoutes = require('./routes/reservas');
const notificacoesRoutes = require('./routes/notificacoes');

const app = express();

// ✅ CORS configurado corretamente para produção
app.use(cors({
  origin: [
    'https://main.dlm5jb4lw8ys1.amplifyapp.com',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], // ✅ ADICIONADO
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'], // ✅ ADICIONADO
  exposedHeaders: ['Content-Range', 'X-Content-Range'], // ✅ ADICIONADO
  maxAge: 86400 // Cache preflight por 24h
}));

// ✅ Middleware OPTIONS para preflight requests
app.options('*', cors());

app.use(express.json());

// Rota de teste
app.get('/api/test', (req, res) => {
  res.json({ message: 'API funcionando' });
});

// TODAS as rotas com /api
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', locaisRoutes);
app.use('/api', reservasRoutes);
app.use('/api', notificacoesRoutes);

module.exports = app;
