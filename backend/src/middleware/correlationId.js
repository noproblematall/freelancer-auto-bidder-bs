const { v4: uuidv4 } = require('uuid');

/**
 * Middleware to generate and propagate correlation IDs for request tracing
 */
function correlationIdMiddleware(req, res, next) {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
}

module.exports = correlationIdMiddleware;
