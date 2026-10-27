// In Electron packaged mode, main.js sets all env vars before requiring the
// backend, so dotenv is unnecessary.  dotenv internally calls process.cwd()
// which can throw EPERM on macOS when the app is launched from Finder/Dock
// (CWD is / or a restricted directory).  Skip it entirely in that case.
if (process.env.ELECTRON_MODE !== 'true') {
  const dotenv = require('dotenv');
  const path = require('path');
  dotenv.config({ path: path.join(__dirname, '../../.env') });
}

const required = ['JWT_SECRET', 'ENCRYPTION_KEY'];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

module.exports = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET,
  encryptionKey: process.env.ENCRYPTION_KEY,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:8080',
  freelancer: {
    // clientId and clientSecret are now stored per-user in the DB (encrypted).
    // Only the redirect URI and base URLs remain global config.
    redirectUri: process.env.FREELANCER_REDIRECT_URI || 'http://localhost:3001/api/auth/freelancer/callback',
    oauthBase: process.env.FREELANCER_OAUTH_BASE || 'https://accounts.freelancer.com',
    apiBase: process.env.FREELANCER_API_BASE || 'https://www.freelancer.com/api',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
  },
};
