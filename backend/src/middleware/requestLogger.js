const expressPino = require('express-pino-logger');
const logger = require('../utils/logger');

const requestLogger = expressPino({
  logger,
  autoLogging: true,
  customProps: (req) => ({
    userId: req.userId || null,
  }),
});

module.exports = requestLogger;
