// Bid history retention. Each account keeps its newest `bidHistoryLimit` bid
// records (Settings → Auto-Bidding, 50,000 by default); once a day everything
// older is removed, together with project rows that are left with no bid.
//
// Two kinds of record are never removed:
//   • won bids (status 'converted'): the Clients page totals are rebuilt from them
//   • bids from the last 7 days: the engine uses them to avoid bidding twice on
//     a project and to count the hourly and daily caps
const prisma = require('../../config/database');
const logger = require('../../utils/logger');

const DEFAULT_BID_HISTORY_LIMIT = 50000;
const MIN_BID_HISTORY_LIMIT = 1000;
const MAX_BID_HISTORY_LIMIT = 1000000;

const KEPT_STATUSES = ['converted'];
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 60 * 1000;

// The stored limit, or the default when it is missing or out of range.
function normalizeLimit(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_BID_HISTORY_LIMIT || n > MAX_BID_HISTORY_LIMIT) return DEFAULT_BID_HISTORY_LIMIT;
  return n;
}

// Removes one account's bid records beyond its newest `limit`.
// Returns { bids, projects } removed.
async function pruneUserBidHistory(userId, limit, now = Date.now()) {
  const keep = normalizeLimit(limit);
  // The newest record that falls outside the limit; it and everything older go.
  const boundary = await prisma.bid.findFirst({
    where: { userId },
    orderBy: { id: 'desc' },
    skip: keep,
    select: { id: true },
  });
  if (!boundary) return { bids: 0, projects: 0 };

  const where = {
    userId,
    id: { lte: boundary.id },
    status: { notIn: KEPT_STATUSES },
    createdAt: { lt: new Date(now - RECENT_WINDOW_MS) },
  };
  let bids = 0;
  let projects = 0;
  for (;;) {
    const batch = await prisma.bid.findMany({
      where,
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: { id: true, projectId: true },
    });
    if (batch.length === 0) break;
    const removed = await prisma.bid.deleteMany({ where: { id: { in: batch.map((b) => b.id) } } });
    bids += removed.count;
    // Project rows exist for their bids; drop the ones nothing points to any more.
    const orphaned = await prisma.project.deleteMany({
      where: {
        id: { in: [...new Set(batch.map((b) => b.projectId))] },
        bids: { none: {} },
        meetings: { none: {} },
      },
    });
    projects += orphaned.count;
    if (batch.length < BATCH_SIZE) break;
  }
  return { bids, projects };
}

async function pruneAllBidHistory() {
  const users = await prisma.user.findMany({ select: { id: true, bidHistoryLimit: true } });
  let bids = 0;
  let projects = 0;
  for (const user of users) {
    try {
      const removed = await pruneUserBidHistory(user.id, user.bidHistoryLimit);
      bids += removed.bids;
      projects += removed.projects;
    } catch (err) {
      logger.error(`History retention: failed for user ${user.id}: ${err.message}`);
    }
  }
  if (bids > 0) logger.info(`History retention: removed ${bids} old bid record(s) and ${projects} project row(s)`);
  return { bids, projects };
}

let timer = null;

// Runs shortly after startup, then every 24 hours while the app stays open.
// A desktop app is rarely open at a fixed hour, so this does not use a clock time.
function startHistoryRetention() {
  if (timer) return;
  const run = () => pruneAllBidHistory().catch((err) => logger.error(`History retention: ${err.message}`));
  const first = setTimeout(run, FIRST_RUN_DELAY_MS);
  timer = setInterval(run, DAY_MS);
  first.unref();
  timer.unref();
  logger.info('History retention started (checking once a day)');
}

function stopHistoryRetention() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  DEFAULT_BID_HISTORY_LIMIT, MIN_BID_HISTORY_LIMIT, MAX_BID_HISTORY_LIMIT,
  normalizeLimit, pruneUserBidHistory, pruneAllBidHistory, startHistoryRetention, stopHistoryRetention,
};
