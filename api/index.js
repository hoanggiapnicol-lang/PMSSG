const server = require('../server.js');
const handleRequest = server.handleRequest || server.default?.handleRequest || server.default || server;

module.exports = (req, res) => handleRequest(req, res);
