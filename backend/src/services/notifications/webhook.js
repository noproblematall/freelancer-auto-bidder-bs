const axios = require('axios');
const logger = require('../../utils/logger');

// User-configurable webhook: POSTs a JSON event to the user's own endpoint
// (Zapier, n8n, Make, a custom server, ...). This runs inside the user's local
// desktop app against a URL the user typed themselves, so there is no SSRF
// boundary to defend — we just validate the shape and fail quietly without
// ever breaking the message poll loop.

const TIMEOUT_MS = 10000;

/**
 * True if the string looks like a usable webhook endpoint (http/https URL).
 */
function isValidWebhookUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Fire a webhook event. Never throws — returns { ok, status?, error? } so
 * callers can log without try/catch ceremony.
 *
 * Payload envelope: { event, timestamp, data }
 */
async function fireWebhook(url, event, data) {
  if (!isValidWebhookUrl(url)) return { ok: false, error: 'invalid_url' };
  try {
    const res = await axios.post(
      url.trim(),
      { event, timestamp: new Date().toISOString(), data },
      {
        timeout: TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Growlance-Webhook/1.0',
        },
        // Any HTTP response counts as "delivered" — the receiver's status is
        // their business; we only care that the endpoint was reachable.
        validateStatus: () => true,
        maxRedirects: 3,
      }
    );
    logger.info(`Webhook ${event} → ${res.status}`);
    return { ok: true, status: res.status };
  } catch (err) {
    logger.warn(`Webhook ${event} failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

module.exports = { fireWebhook, isValidWebhookUrl };
