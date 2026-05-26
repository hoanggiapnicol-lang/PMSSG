const server = require('../server.js');

function resolveHandler(value, seen = new Set()) {
  if (typeof value === 'function') {
    return value;
  }
  if (!value || seen.has(value)) {
    return null;
  }
  seen.add(value);
  return resolveHandler(value.handleRequest, seen) || resolveHandler(value.default, seen);
}

module.exports = (req, res) => {
  const handleRequest = resolveHandler(server);
  if (!handleRequest) {
    res.statusCode = 500;
    res.end('Vercel handler not found');
    return;
  }
  return handleRequest(req, res);
};
