// Asks Freelancer what became of the bids we placed, so wins and losses are
// recorded without anyone marking them by hand:
//
//   1. award status of every open bid (awarded / rejected / revoked / retracted)
//   2. the project's status, to tell "lost to someone else" (work in progress
//      or complete, not ours) from "expired" (closed with nobody hired)
//   3. client replies that arrived while the app was closed (the message
//      poller only looks back 30 minutes)
//   4. about once a month, the AI analytics review, when enabled
//
// Runs 90 s after start and then every 30 minutes. Everything here is
// read-only on Freelancer; nothing is bid, sent or retracted.
const cron = require('node-cron');
const prisma = require('../../config/database');
const { createFreelancerClient } = require('../freelancer/client');
const { getMyBidsForProjects } = require('../freelancer/bids');
const { getProjectsByIds } = require('../freelancer/projects');
const { getProjectThreads } = require('../freelancer/messages');
const { decrypt, isExpired } = require('../../utils/tokenManager');
const { recordClientReply, recordAwardStatus } = require('./outcomes');
const { captureWinningBid } = require('../insights/winningBids');

// Once a project is decided, keep the bid that won it (ours or someone else's).
async function keepWinner(client, bid, myUid) {
  try {
    await captureWinningBid(client, { project: { id: bid.project.id, freelancerProjectId: bid.project.freelancerProjectId, bidCount: null }, myUid });
  } catch (err) {
    logger.warn(`outcomeSync: winning bid for project #${bid.project.id} not read: HTTP ${err.response?.status ?? 'NETWORK'} ${err.message}`);
  }
}
const { notifyBidAwarded } = require('../notifications/telegram');
const { parseChatIds } = require('../../utils/chatUtils');
const logger = require('../../utils/logger');

const OPEN_AWARD = [null, 'pending'];
const BID_WINDOW_DAYS = 90;      // bids older than this are left as they are
const REPLY_WINDOW_DAYS = 30;    // how far back to look for missed client replies
const CHUNK = 40;
const AUTO_REVIEW_DAYS = 30;
const AUTO_REVIEW_MIN_BIDS = 20;

let job = null;
let running = false;

const chunk = (xs, n) => { const out = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out; };

function senderFromUsers(users, id) {
  const u = id ? users?.[String(id)] : null;
  return { id: id || null, displayName: u?.display_name || u?.public_name || null, username: u?.username || null, country: u?.location?.country?.code || null };
}

async function syncAwards(user, client, myUid) {
  const since = new Date(Date.now() - BID_WINDOW_DAYS * 86400000);
  const bids = await prisma.bid.findMany({
    where: { userId: user.id, status: { in: ['placed', 'converted'] }, freelancerBidId: { not: null }, createdAt: { gte: since }, OR: [{ awardStatus: null }, { awardStatus: 'pending' }] },
    select: { id: true, status: true, amount: true, projectId: true, freelancerBidId: true, awardStatus: true, clientRepliedAt: true, project: { select: { id: true, freelancerProjectId: true, ownerId: true, status: true } } },
  });
  if (!bids.length) return { checked: 0, awarded: 0, lost: 0 };
  const stats = { checked: bids.length, awarded: 0, lost: 0 };
  const byProject = new Map(bids.map((b) => [b.project.freelancerProjectId, b]));
  const telegram = user.telegramBidNotificationsEnabled && user.telegramBotToken && user.telegramChatId;

  for (const ids of chunk([...byProject.keys()], CHUNK)) {
    // 1. award status straight from the bid objects
    let flBids = [];
    try { flBids = await getMyBidsForProjects(client, { bidderId: myUid, projectIds: ids }); } catch (err) {
      logger.warn(`outcomeSync: bids lookup failed for user ${user.id}: HTTP ${err.response?.status ?? 'NETWORK'} ${err.message}`);
      continue;
    }
    const seen = new Set();
    for (const fb of flBids) {
      const bid = byProject.get(fb.project_id);
      if (!bid || (bid.freelancerBidId && fb.id && fb.id !== bid.freelancerBidId)) continue;
      seen.add(fb.project_id);
      if (fb.retracted && bid.status !== 'retracted') {
        await prisma.bid.update({ where: { id: bid.id }, data: { status: 'retracted', lastSyncedAt: new Date() } }).catch(() => {});
        continue;
      }
      const status = String(fb.award_status || 'pending').toLowerCase();
      const at = fb.time_awarded ? new Date(fb.time_awarded * 1000) : new Date();
      const change = await recordAwardStatus({ userId: user.id, bid, awardStatus: status, at, sender: { id: bid.project.ownerId } });
      if (change === 'awarded') await keepWinner(client, bid, myUid);
      if (change === 'awarded') {
        stats.awarded++;
        if (telegram) {
          const project = await prisma.project.findUnique({ where: { id: bid.projectId }, select: { title: true, freelancerProjectId: true, currency: true } });
          for (const chatId of parseChatIds(user.telegramChatId)) {
            notifyBidAwarded({ botToken: decrypt(user.telegramBotToken), chatId, projectTitle: project?.title, projectUrl: `https://www.freelancer.com/projects/${project?.freelancerProjectId}`, amount: bid.amount, currency: project?.currency })
              .catch((e) => logger.warn(`Telegram award notification failed: ${e.message}`));
          }
        }
      } else if (change === 'rejected' || change === 'revoked') stats.lost++;
    }

    // 2. project status: lost to someone else, or expired with nobody hired
    let projects = [];
    try { projects = await getProjectsByIds(client, ids); } catch (err) {
      logger.warn(`outcomeSync: project lookup failed for user ${user.id}: HTTP ${err.response?.status ?? 'NETWORK'} ${err.message}`);
      continue;
    }
    for (const fp of projects) {
      const bid = byProject.get(fp.id);
      if (!bid) continue;
      const status = String(fp.status || '').toLowerCase();
      const frontend = String(fp.frontend_project_status || '').toLowerCase();
      if (status && status !== bid.project.status) {
        await prisma.project.update({ where: { id: bid.project.id }, data: { status, lastCheckedAt: new Date() } }).catch(() => {});
      }
      const fresh = await prisma.bid.findUnique({ where: { id: bid.id }, select: { awardStatus: true } });
      if (fresh?.awardStatus && !OPEN_AWARD.includes(fresh.awardStatus)) continue; // already decided above
      const selected = Array.isArray(fp.selected_bids) ? fp.selected_bids : [];
      const mineSelected = selected.some((s) => s.bidder_id === myUid || s.id === bid.freelancerBidId);
      if (mineSelected) {
        const change = await recordAwardStatus({ userId: user.id, bid, awardStatus: 'awarded', at: new Date(), sender: { id: bid.project.ownerId } });
        if (change === 'awarded') { stats.awarded++; await keepWinner(client, bid, myUid); }
      } else if (frontend === 'work_in_progress' || frontend === 'complete' || (selected.length > 0 && !mineSelected)) {
        if (await recordAwardStatus({ userId: user.id, bid, awardStatus: 'lost', at: new Date() })) { stats.lost++; await keepWinner(client, bid, myUid); }
      } else if (status === 'closed' || status === 'frozen' || frontend === 'closed') {
        if (await recordAwardStatus({ userId: user.id, bid, awardStatus: 'expired', at: new Date() })) stats.lost++;
      } else if (!seen.has(fp.id)) {
        await prisma.bid.update({ where: { id: bid.id }, data: { lastSyncedAt: new Date() } }).catch(() => {});
      }
    }
  }
  return stats;
}

// 3. Replies the poller missed (app closed): threads on projects we bid on.
async function syncReplies(user, client, myUid) {
  const since = new Date(Date.now() - REPLY_WINDOW_DAYS * 86400000);
  const bids = await prisma.bid.findMany({
    where: { userId: user.id, status: { in: ['placed', 'converted'] }, clientRepliedAt: null, createdAt: { gte: since } },
    select: { id: true, status: true, amount: true, projectId: true, clientRepliedAt: true, project: { select: { freelancerProjectId: true } } },
  });
  if (!bids.length) return 0;
  const byProject = new Map(bids.map((b) => [b.project.freelancerProjectId, b]));
  let found = 0;
  for (const ids of chunk([...byProject.keys()], 20)) {
    let threads, users;
    try { ({ threads, users } = await getProjectThreads(client, ids)); } catch (err) {
      logger.warn(`outcomeSync: thread lookup failed for user ${user.id}: HTTP ${err.response?.status ?? 'NETWORK'} ${err.message}`);
      return found;
    }
    for (const t of threads) {
      const ctx = t.thread?.context;
      if (!ctx || ctx.type !== 'project') continue;
      const bid = byProject.get(ctx.id);
      if (!bid) continue;
      const fromClient = (t.messages || []).filter((m) => String(m.from_user) !== String(myUid));
      if (!fromClient.length) continue;
      const earliest = fromClient.reduce((a, m) => (m.time_created < a ? m.time_created : a), fromClient[0].time_created);
      const sender = senderFromUsers(users, fromClient[0].from_user);
      if (await recordClientReply({ userId: user.id, bid, at: new Date(earliest * 1000), sender, source: 'sync' })) found++;
      await prisma.messageThread.upsert({
        where: { userId_freelancerThreadId: { userId: user.id, freelancerThreadId: t.id } },
        update: { projectId: bid.projectId, clientFreelancerId: Number(fromClient[0].from_user) || null },
        create: { userId: user.id, freelancerThreadId: t.id, projectId: bid.projectId, clientFreelancerId: Number(fromClient[0].from_user) || null, lastMessageFromClientAt: new Date(earliest * 1000) },
      }).catch(() => {});
    }
  }
  return found;
}

// 4. Monthly AI review when enabled, with a key, and enough new bids to read.
async function maybeAutoReview(user) {
  if (!user.aiReviewAuto || !user.openaiApiKey) return;
  const last = await prisma.activityLog.findFirst({ where: { userId: user.id, action: 'ai_analytics_report' }, orderBy: { id: 'desc' }, select: { createdAt: true } });
  const sinceDate = last?.createdAt || new Date(0);
  if (Date.now() - sinceDate.getTime() < AUTO_REVIEW_DAYS * 86400000) return;
  const sent = await prisma.bid.count({ where: { userId: user.id, status: { in: ['placed', 'converted', 'rejected', 'retracted'] }, createdAt: { gte: sinceDate } } });
  if (sent < AUTO_REVIEW_MIN_BIDS) return;
  try {
    const { generateAiReview } = require('../../routes/analytics.routes');
    const result = await generateAiReview(user.id, '30d', { trigger: 'auto' });
    logger.info(`outcomeSync: automatic AI review generated for user ${user.id}: ${result?.report?.headline || ''}`);
  } catch (err) {
    logger.warn(`outcomeSync: automatic AI review failed for user ${user.id}: ${err.message}`);
  }
}

async function syncUser(user) {
  const token = user.freelancerToken;
  if (!token || isExpired(token.expiresAt)) return;
  const myUid = Number(token.freelancerUid);
  if (!myUid) return;
  const client = createFreelancerClient(decrypt(token.accessToken));
  const awards = await syncAwards(user, client, myUid);
  const replies = await syncReplies(user, client, myUid);
  if (awards.checked || replies) {
    logger.info(`outcomeSync: user ${user.id} — ${awards.checked} open bid(s) checked, ${awards.awarded} awarded, ${awards.lost} lost/expired, ${replies} missed repl${replies === 1 ? 'y' : 'ies'} found`);
  }
  await maybeAutoReview(user);
}

async function syncOutcomes() {
  if (running) return;
  running = true;
  try {
    const users = await prisma.user.findMany({
      where: { freelancerToken: { isNot: null } },
      select: {
        id: true, openaiApiKey: true, aiReviewAuto: true,
        telegramBidNotificationsEnabled: true, telegramBotToken: true, telegramChatId: true,
        freelancerToken: { select: { accessToken: true, freelancerUid: true, expiresAt: true } },
      },
    });
    for (const user of users) {
      try { await syncUser(user); } catch (err) { logger.error(`outcomeSync: user ${user.id} failed: ${err.message}`); }
    }
  } finally {
    running = false;
  }
}

function startOutcomeSync(cronExpression = '*/30 * * * *') {
  if (job) return;
  logger.info(`outcomeSync: starting (${cronExpression})`);
  setTimeout(() => syncOutcomes().catch((e) => logger.error(`outcomeSync: ${e.message}`)), 90 * 1000);
  job = cron.schedule(cronExpression, () => syncOutcomes().catch((e) => logger.error(`outcomeSync: ${e.message}`)));
}

function stopOutcomeSync() {
  if (job) { job.stop(); job = null; }
}

module.exports = { startOutcomeSync, stopOutcomeSync, syncOutcomes, syncAwards, syncReplies };
