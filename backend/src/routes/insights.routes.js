// Market page: winning bids on projects we bid on, and the client explorer.
const express = require('express');
const authMiddleware = require('../middleware/auth');
const { syncWinningBids, winningBidRows, studyWinningBids, latestWinningBidStudy } = require('../services/insights/winningBids');
const { topClients, clientHistory, clientProjectBids, studyClient, latestClientStudy } = require('../services/insights/clients');

const router = express.Router();
router.use(authMiddleware);

const send = (res, next) => (err) => {
  if (err.status === 400 || err.status === 502) return res.status(err.status).json({ error: err.message });
  const status = err.response?.status;
  if (status === 401 || status === 403) return res.status(400).json({ error: 'Freelancer rejected the request. Reconnect it in Settings.' });
  if (status === 429) return res.status(429).json({ error: 'Freelancer is rate limiting requests. Try again in a minute.' });
  next(err);
};

// Winning bids
router.get('/winning-bids', async (req, res, next) => {
  try { res.json(await winningBidRows(req.userId, req.query.period || '90d')); } catch (err) { send(res, next)(err); }
});
router.post('/winning-bids/sync', async (req, res, next) => {
  try { res.json(await syncWinningBids(req.userId, { limit: 30 })); } catch (err) { send(res, next)(err); }
});
router.get('/winning-bids/study', async (req, res, next) => {
  try { res.json(await latestWinningBidStudy(req.userId)); } catch (err) { next(err); }
});
router.post('/winning-bids/study', async (req, res, next) => {
  try { res.json(await studyWinningBids(req.userId, req.query.period || '90d')); } catch (err) { send(res, next)(err); }
});

// Client explorer
router.get('/clients', async (req, res, next) => {
  try { res.json(await topClients(req.userId, { period: req.query.period || '90d', limit: Math.min(100, Number(req.query.limit) || 40) })); } catch (err) { send(res, next)(err); }
});
router.get('/clients/:ownerId/history', async (req, res, next) => {
  try { res.json(await clientHistory(req.userId, Number(req.params.ownerId))); } catch (err) { send(res, next)(err); }
});
router.get('/clients/:ownerId/projects/:projectId/bids', async (req, res, next) => {
  try { res.json(await clientProjectBids(req.userId, Number(req.params.projectId))); } catch (err) { send(res, next)(err); }
});
router.get('/clients/:ownerId/study', async (req, res, next) => {
  try { res.json(await latestClientStudy(req.userId, Number(req.params.ownerId))); } catch (err) { next(err); }
});
router.post('/clients/:ownerId/study', async (req, res, next) => {
  try { res.json(await studyClient(req.userId, Number(req.params.ownerId))); } catch (err) { send(res, next)(err); }
});

module.exports = router;
