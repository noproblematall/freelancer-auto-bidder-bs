const logger = require('../utils/logger');

/**
 * Middleware to track request performance and log slow requests
 */
function performanceMetrics(req, res, next) {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;

    // Log slow requests (>1 second)
    if (duration > 1000) {
      logger.warn({
        msg: 'Slow request detected',
        method: req.method,
        url: req.url,
        duration,
        statusCode: res.statusCode,
        requestId: req.id,
      });
    }

    // Log all request metrics at debug level
    logger.debug({
      msg: 'Request completed',
      method: req.method,
      url: req.url,
      duration,
      statusCode: res.statusCode,
      requestId: req.id,
    });
  });

  next();
}

module.exports = performanceMetrics;
