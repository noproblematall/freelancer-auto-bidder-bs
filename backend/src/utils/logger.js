const pino = require('pino');
const os = require('os');
const fs = require('fs');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

// In the desktop app nothing reads stdout, so the log also goes to a file
// (LOG_FILE, set by the Electron shell to <userData>/logs/backend.log) that
// the user can send when something fails. Kept small: rotated at ~5 MB.
function fileDestination() {
  const file = process.env.LOG_FILE;
  if (!file || isDev) return null;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      if (fs.statSync(file).size > 5 * 1024 * 1024) fs.renameSync(file, `${file}.1`);
    } catch { /* no file yet */ }
    return pino.destination({ dest: file, sync: false, mkdir: true });
  } catch {
    return null;
  }
}

const dest = fileDestination();

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDev
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
}, dest || undefined);

module.exports = logger;
