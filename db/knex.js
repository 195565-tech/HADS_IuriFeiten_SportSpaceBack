//select nativo, sem ORM
const knex = require('knex');
const config = require('../knexfile');

let db = null;

function getConnection() {
  if (!db) {
    console.log('Criando nova conexão com o banco...');
    db = knex({
      ...config,
      pool: {
        min: 0,
        max: 2,
        acquireTimeoutMillis: 5000,
        createTimeoutMillis: 5000,
        destroyTimeoutMillis: 5000,
        idleTimeoutMillis: 5000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 200,
      }
    });
  }
  return db;
}

module.exports = getConnection();
