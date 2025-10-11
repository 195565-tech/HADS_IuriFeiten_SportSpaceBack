const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
// const authRoutes = require('./routes/auth');
// const userRoutes = require('./routes/users');
// ... outras rotas ...

const app = express();

app.use(cors({
  origin: 'https://main.dlm5jb4lw8ys1.amplifyapp.com',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// app.use('/api', authRoutes);
// app.use('/api', userRoutes);
// ... outras rotas ...

module.exports = app;
