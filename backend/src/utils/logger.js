const pino = require('pino');
const os = require('os');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
    ? { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } }
    : undefined,
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      userId: req.userId,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
    err: pino.stdSerializers.err,
  },
  base: {
    pid: process.pid,
    hostname: os.hostname(),
  },
});

module.exports = logger;
