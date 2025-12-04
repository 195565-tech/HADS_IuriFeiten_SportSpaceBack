//Responsável por chamar biblioteca da AWS
const serverless = require('serverless-http');
const app = require('./app');

module.exports.handler = serverless(app);
