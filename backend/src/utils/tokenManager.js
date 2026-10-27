const crypto = require('crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function getKey() {
  return Buffer.from(env.encryptionKey, 'hex');
}

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
  if (!encryptedText) return null;
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function isExpired(expiresAt) {
  return new Date(expiresAt) < new Date();
}

// Returns true if the token is expired or expires within `thresholdMs` (default 5 min)
function willExpireSoon(expiresAt, thresholdMs = 5 * 60 * 1000) {
  return new Date(expiresAt) < new Date(Date.now() + thresholdMs);
}

module.exports = { encrypt, decrypt, isExpired, willExpireSoon };
