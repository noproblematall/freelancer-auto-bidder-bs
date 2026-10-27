const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Skip rate limiting in dev/test and in Electron mode.
// In Electron, Express binds to 127.0.0.1 and the only caller is the app itself —
// the scheduler makes many rapid internal API calls that would trip these limits.
const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
const isElectron = process.env.ELECTRON_MODE === 'true';

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 1000 : 100,
  skip: () => isElectron,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn({
      msg: 'Rate limit exceeded',
      ip: req.ip,
      url: req.url,
      requestId: req.id,
    });
    res.status(429).json({ error: 'Rate limit exceeded', requestId: req.id });
  },
});

// Auth limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100 : 5,
  skipSuccessfulRequests: true,
  skip: () => isElectron,
  message: 'Too many login attempts, please try again later.',
  handler: (req, res) => {
    logger.warn({
      msg: 'Auth rate limit exceeded',
      ip: req.ip,
      url: req.url,
      requestId: req.id,
    });
    res.status(429).json({ error: 'Too many login attempts', requestId: req.id });
  },
});

// Bid limiter
const bidLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 100 : 10,
  skip: () => isElectron,
  message: 'Too many bid requests, please slow down.',
  handler: (req, res) => {
    logger.warn({
      msg: 'Bid rate limit exceeded',
      ip: req.ip,
      userId: req.userId,
      requestId: req.id,
    });
    res.status(429).json({ error: 'Too many bid requests', requestId: req.id });
  },
});

module.exports = { apiLimiter, authLimiter, bidLimiter };
