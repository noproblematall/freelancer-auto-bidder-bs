const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error(`${req.method} ${req.path} - ${err.message}`, err.stack);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  if (err.name === 'UnauthorizedError' || err.status === 401) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // The only client is the app itself on this machine, so the real reason is
  // returned even in production: "Internal server error" alone cannot be
  // acted on, and the log it would point to is not something the user reads.
  const message = String(err.message || '').trim().slice(0, 400);
  const status = err.status || 500;
  res.status(status).json({
    error: !message ? 'Internal server error' : status >= 500 ? `Internal error: ${message}` : message,
    requestId: req.id || undefined,
  });
}

module.exports = errorHandler;
