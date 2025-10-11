require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const locaisRoutes = require('./routes/locais');
const reservasRoutes = require('./routes/reservas');
const notificacoesRoutes = require('./routes/notificacoes');

const app = express();



app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Rotas
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', locaisRoutes);
app.use('/api', reservasRoutes);
app.use('/api', notificacoesRoutes);

module.exports = app;