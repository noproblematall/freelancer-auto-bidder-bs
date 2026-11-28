// Messages page: client conversations, and one conversation with its client,
// project and bid.
const express = require('express');
const authMiddleware = require('../middleware/auth');
const { listConversations, getConversation, clearCache } = require('../services/messaging/conversations');
const logger = require('../utils/logger');

const router = express.Router();
router.use(authMiddleware);

// Failures answer a page load or a click, so the real reason is returned.
const send = (res, what) => (err) => {
  if ([400, 404, 502].includes(err.status)) return res.status(err.status).json({ error: err.message });
  const status = err.response?.status;
  if (status === 401 || status === 403) return res.status(400).json({ error: `Freelancer rejected the request (HTTP ${status}). Reconnect it in Settings.` });
  if (status === 429) return res.status(429).json({ error: 'Freelancer is rate limiting requests. Try again in a minute.' });
  logger.error({ err }, `conversations: ${what} failed`);
  res.status(500).json({ error: `${what} failed: ${String(err.response?.data?.message || err.message || 'unknown error').slice(0, 300)}` });
};

const threadIdOf = (req) => {
  const id = Number(req.params.threadId);
  if (!Number.isInteger(id) || id <= 0) { const e = new Error('Invalid conversation id.'); e.status = 400; throw e; }
  return id;
};

router.get('/', async (req, res) => {
  try {
    if (req.query.refresh) clearCache(req.userId);
    res.json(await listConversations(req.userId));
  } catch (err) { send(res, 'Reading your conversations')(err); }
});

router.get('/:threadId', async (req, res) => {
  try {
    const id = threadIdOf(req);
    if (req.query.refresh) clearCache(req.userId, id);
    res.json(await getConversation(req.userId, id));
  } catch (err) { send(res, 'Reading the conversation')(err); }
});

module.exports = router;
