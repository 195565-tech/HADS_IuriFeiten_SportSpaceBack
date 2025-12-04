//Arquivo de config do knex
require('dotenv').config();

module.exports = {
  client: 'pg',
  connection: {
    host: process.env.PG_HOST,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
    port: process.env.PG_PORT,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
    query_timeout: 5000
  },
  pool: {
    min: 0,
    max: 2,
    acquireTimeoutMillis: 5000,
    createTimeoutMillis: 5000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
  },
  migrations: {
    directory: './migrations'
  }
};
