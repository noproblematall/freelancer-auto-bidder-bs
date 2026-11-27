// Market page: winning bids on projects we bid on, and the client explorer.
const express = require('express');
const authMiddleware = require('../middleware/auth');
const { syncWinningBids, winningBidRows, studyWinningBids, latestWinningBidStudy } = require('../services/insights/winningBids');
const { topClients, clientHistory, clientProjectBids, studyClient, latestClientStudy } = require('../services/insights/clients');
const logger = require('../utils/logger');

const router = express.Router();
router.use(authMiddleware);

// Every failure here answers a button click, so the real reason is returned
// (the generic handler would hide it as "Internal server error" in production).
const send = (res, what) => (err) => {
  if (err.status === 400 || err.status === 502) return res.status(err.status).json({ error: err.message });
  const status = err.response?.status;
  if (status === 401 || status === 403) return res.status(400).json({ error: `Freelancer rejected the request (HTTP ${status}). Reconnect it in Settings.` });
  if (status === 429) return res.status(429).json({ error: 'Freelancer is rate limiting requests. Try again in a minute.' });
  logger.error({ err }, `insights: ${what} failed`);
  const detail = err.response?.data?.message || err.message || 'unknown error';
  res.status(500).json({ error: `${what} failed: ${String(detail).slice(0, 300)}` });
};

// Winning bids
router.get('/winning-bids', async (req, res, next) => {
  try { res.json(await winningBidRows(req.userId, req.query.period || '30d')); } catch (err) { send(res, 'Reading winning bids')(err); }
});
router.post('/winning-bids/sync', async (req, res, next) => {
  try { res.json(await syncWinningBids(req.userId)); } catch (err) { send(res, 'Fetching winning bids')(err); }
});
router.get('/winning-bids/study', async (req, res, next) => {
  try { res.json(await latestWinningBidStudy(req.userId)); } catch (err) { next(err); }
});
router.post('/winning-bids/study', async (req, res, next) => {
  try { res.json(await studyWinningBids(req.userId, req.query.period || '30d')); } catch (err) { send(res, 'The winning-bid study')(err); }
});

// Client explorer
router.get('/clients', async (req, res, next) => {
  // The page paginates the list itself, so send the whole ranking (capped).
  try { res.json(await topClients(req.userId, { period: req.query.period || '30d', limit: Math.min(1000, Number(req.query.limit) || 1000) })); } catch (err) { send(res, 'Ranking clients')(err); }
});
// :ownerId is the anonymous client key (text), see services/insights/clients.js.
router.get('/clients/:ownerId/history', async (req, res, next) => {
  try { res.json(await clientHistory(req.userId, String(req.params.ownerId))); } catch (err) { send(res, 'Reading the client history')(err); }
});
router.get('/clients/:ownerId/projects/:projectId/bids', async (req, res, next) => {
  try { res.json(await clientProjectBids(req.userId, Number(req.params.projectId))); } catch (err) { send(res, 'Reading the bids')(err); }
});
router.get('/clients/:ownerId/study', async (req, res, next) => {
  try { res.json(await latestClientStudy(req.userId, String(req.params.ownerId))); } catch (err) { next(err); }
});
router.post('/clients/:ownerId/study', async (req, res, next) => {
  try { res.json(await studyClient(req.userId, String(req.params.ownerId))); } catch (err) { send(res, 'The client study')(err); }
});

module.exports = router;
