require('dotenv').config();
const app = require('./app');
const db = require('./db/knex');

const PORT = process.env.PORT || 3000;

// Testa conexão com o banco antes de subir o servidor
db.raw('SELECT 1')
  .then(() => {
    console.log('✅ Conectado ao PostgreSQL com sucesso');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ ERRO ao conectar no banco:', err);
    process.exit(1);
  });

// Para AWS Lambda, basta exportar o app do app.js e usar serverless-http