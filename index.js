//Chama mapeamento de rotas
require('dotenv').config();
const serverless = require('serverless-http');
const app = require('./app');

module.exports.handler = serverless(app);
