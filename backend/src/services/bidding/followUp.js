// One follow-up message per bid, some hours after bidding when the client has
// not written back (Settings → Auto-Bidding → Follow up). Only for projects
// still open, not awarded, with a relevance score at or above the follow-up
// minimum, and at most a few per hour so the account never looks like a bot.
// The message is drafted by the user's OpenAI model from the brief and the
// bid text (services/openai/replyDrafter.js) and posted to the project thread.
const cron = require('node-cron');
const prisma = require('../../config/database');
const { createFreelancerClient } = require('../freelancer/client');
const { createProjectThread } = require('../freelancer/messages');
const { createOpenAIClient } = require('../openai/client');
const { draftFollowUp } = require('../openai/replyDrafter');
const { decrypt, isExpired } = require('../../utils/tokenManager');
const logger = require('../../utils/logger');

const MAX_PER_RUN = 5;
const MAX_AGE_HOURS = 96;   // older bids are left alone; a late follow-up reads as spam
let job = null;
let running = false;

async function followUpUser(user) {
  const token = user.freelancerToken;
  if (!token || isExpired(token.expiresAt) || !user.openaiApiKey) return 0;
  const hours = Number.isInteger(user.followUpHours) && user.followUpHours > 0 ? user.followUpHours : 24;
  const minScore = Number.isInteger(user.followUpMinScore) ? user.followUpMinScore : 85;
  const latest = new Date(Date.now() - hours * 3600000);
  const earliest = new Date(Date.now() - MAX_AGE_HOURS * 3600000);

  const bids = await prisma.bid.findMany({
    where: {
      userId: user.id, status: 'placed', followUpAt: null, clientRepliedAt: null,
      OR: [{ awardStatus: null }, { awardStatus: 'pending' }],
      placedAt: { lte: latest, gte: earliest },
      project: { status: 'active', relevanceScore: { gte: minScore }, ownerId: { not: null } },
    },
    orderBy: { placedAt: 'asc' },
    take: MAX_PER_RUN,
    include: { project: true, profile: { select: { skillsSummary: true, experienceSummary: true } } },
  });
  if (!bids.length) return 0;

  const client = createFreelancerClient(decrypt(token.accessToken));
  const openai = createOpenAIClient(decrypt(user.openaiApiKey), user.openaiModel || 'gpt-5.4-mini');
  const profile = { skillsSummary: user.skillsSummary || bids[0].profile?.skillsSummary, experienceSummary: user.experienceSummary || bids[0].profile?.experienceSummary };
  let sent = 0;

  for (const bid of bids) {
    const hoursSinceBid = (Date.now() - new Date(bid.placedAt).getTime()) / 3600000;
    let text;
    try {
      text = await draftFollowUp(openai, { project: bid.project, proposalText: bid.proposalText, profile, hoursSinceBid });
    } catch (err) {
      logger.warn(`followUp: draft failed for bid #${bid.id}: ${err.message}`);
      continue; // try again next hour
    }
    if (!text || text.length < 20) continue;
    try {
      const thread = await createProjectThread(client, { projectId: bid.project.freelancerProjectId, memberIds: [bid.project.ownerId], text });
      await prisma.bid.update({ where: { id: bid.id }, data: { followUpAt: new Date(), followUpThreadId: thread?.id || null } });
      await prisma.activityLog.create({
        data: { userId: user.id, action: 'follow_up_sent', details: JSON.stringify({ bidId: bid.id, projectId: bid.projectId, threadId: thread?.id || null, message: text }) },
      }).catch(() => {});
      sent++;
      logger.info(`followUp: sent for bid #${bid.id} (project #${bid.projectId})`);
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.message || err.message;
      // Freelancer refused (e.g. the client blocks messages before award):
      // record it so the same bid is not retried every hour.
      await prisma.bid.update({ where: { id: bid.id }, data: { followUpAt: new Date() } }).catch(() => {});
      await prisma.activityLog.create({
        data: { userId: user.id, action: 'follow_up_failed', details: JSON.stringify({ bidId: bid.id, projectId: bid.projectId, message: `Follow-up could not be sent${status ? ` (HTTP ${status})` : ''}: ${String(detail).slice(0, 300)}` }) },
      }).catch(() => {});
      logger.warn(`followUp: send failed for bid #${bid.id}: HTTP ${status ?? 'NETWORK'} ${detail}`);
      if (status === 401 || status === 403) break;
    }
  }
  return sent;
}

async function runFollowUps() {
  if (running) return;
  running = true;
  try {
    const users = await prisma.user.findMany({
      where: { followUpEnabled: true, freelancerToken: { isNot: null } },
      select: {
        id: true, openaiApiKey: true, openaiModel: true, followUpHours: true, followUpMinScore: true,
        skillsSummary: true, experienceSummary: true,
        freelancerToken: { select: { accessToken: true, freelancerUid: true, expiresAt: true } },
      },
    });
    for (const user of users) {
      try {
        const n = await followUpUser(user);
        if (n) logger.info(`followUp: ${n} follow-up(s) sent for user ${user.id}`);
      } catch (err) {
        logger.error(`followUp: user ${user.id} failed: ${err.message}`);
      }
    }
  } finally {
    running = false;
  }
}

function startFollowUps(cronExpression = '17 * * * *') {
  if (job) return;
  logger.info(`followUp: starting (${cronExpression})`);
  job = cron.schedule(cronExpression, () => runFollowUps().catch((e) => logger.error(`followUp: ${e.message}`)));
}

function stopFollowUps() {
  if (job) { job.stop(); job = null; }
}

module.exports = { startFollowUps, stopFollowUps, runFollowUps, followUpUser };
