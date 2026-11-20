// Records what happened to a bid after it was placed. Shared by the message
// poller (client wrote back), outcomeSync (Freelancer says awarded / lost) and
// the Bids page (manual conversion), so every path updates the same fields:
//
//   Bid.clientRepliedAt  first message from the client on the project
//   Bid.awardStatus      pending | awarded | rejected | revoked | lost | expired
//   Bid.awardedAt        when Freelancer reported the award
//   Bid.status           'converted' once the client replied or awarded (kept
//                        for the existing Bids/Clients pages)
//   Client               upserted on the first reply, totals bumped on award
const prisma = require('../../config/database');
const logger = require('../../utils/logger');
const { clearLearningCache } = require('./learning');

const REPLY_STATUSES = new Set(['placed', 'converted']);

async function upsertClient(userId, { freelancerUserId, displayName, username, country, amount, increment }) {
  if (!freelancerUserId) return;
  await prisma.client.upsert({
    where: { userId_freelancerUserId: { userId, freelancerUserId } },
    update: {
      ...(displayName && { displayName }),
      ...(username && { username }),
      ...(country && { country }),
      ...(increment && { projectCount: { increment: 1 }, totalValue: { increment: amount || 0 }, lastProjectAt: new Date() }),
      updatedAt: new Date(),
    },
    create: {
      userId, freelancerUserId,
      displayName: displayName || null, username: username || null, country: country || null,
      projectCount: increment ? 1 : 0, totalValue: increment ? (amount || 0) : 0,
      lastProjectAt: increment ? new Date() : null,
    },
  }).catch((e) => logger.warn(`Client upsert failed for ${freelancerUserId}: ${e.message}`));
}

// The client wrote back on a project we bid on. Idempotent: the first call
// sets clientRepliedAt; later calls only keep the earliest time.
async function recordClientReply({ userId, bid, at, sender = {}, source = 'message' }) {
  if (!bid || !REPLY_STATUSES.has(bid.status) && bid.status !== 'pending_review') return false;
  const when = at instanceof Date ? at : new Date(at || Date.now());
  const first = !bid.clientRepliedAt;
  const data = {};
  if (first || when < new Date(bid.clientRepliedAt)) data.clientRepliedAt = when;
  if (bid.status === 'placed') data.status = 'converted';
  if (!Object.keys(data).length) return false;
  await prisma.bid.update({ where: { id: bid.id }, data });
  if (first) {
    await prisma.activityLog.create({
      data: {
        userId, action: 'bid_converted',
        details: JSON.stringify({ bidId: bid.id, projectId: bid.projectId, reason: source === 'sync' ? 'client_message_found_on_sync' : 'first_client_message', senderId: sender.id || null }),
      },
    }).catch(() => {});
    await upsertClient(userId, {
      freelancerUserId: sender.id ? Number(sender.id) : null,
      displayName: sender.displayName || null, username: sender.username || null, country: sender.country || null,
      amount: bid.amount, increment: true,
    });
    clearLearningCache(userId);
    logger.info(`Bid #${bid.id}: client replied (${source})`);
  }
  return first;
}

// Freelancer reported the bid's award status. Returns the change made, if any.
async function recordAwardStatus({ userId, bid, awardStatus, at, sender = {} }) {
  const next = String(awardStatus || '').toLowerCase();
  if (!next || next === bid.awardStatus) {
    await prisma.bid.update({ where: { id: bid.id }, data: { lastSyncedAt: new Date() } }).catch(() => {});
    return null;
  }
  const data = { awardStatus: next, lastSyncedAt: new Date() };
  let action = null;
  if (next === 'awarded') {
    data.awardedAt = at instanceof Date ? at : new Date(at || Date.now());
    if (bid.status === 'placed') data.status = 'converted';
    action = 'bid_awarded';
  } else if (next === 'rejected' || next === 'revoked') {
    action = 'bid_lost';
  } else if (next === 'lost' || next === 'expired') {
    action = 'bid_lost';
  }
  await prisma.bid.update({ where: { id: bid.id }, data });
  if (action) {
    await prisma.activityLog.create({
      data: { userId, action, details: JSON.stringify({ bidId: bid.id, projectId: bid.projectId, awardStatus: next, amount: bid.amount }) },
    }).catch(() => {});
  }
  if (next === 'awarded') {
    await upsertClient(userId, {
      freelancerUserId: sender.id ? Number(sender.id) : null,
      displayName: sender.displayName || null, username: sender.username || null, country: sender.country || null,
      amount: bid.amount, increment: !bid.clientRepliedAt, // the reply already counted the project
    });
    logger.info(`Bid #${bid.id}: AWARDED`);
  }
  clearLearningCache(userId);
  return next;
}

module.exports = { recordClientReply, recordAwardStatus, upsertClient };
