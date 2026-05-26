const server = require('../server.js');
const handleRequest = server.handleRequest || server;

module.exports = (req, res) => handleRequest(req, res);
