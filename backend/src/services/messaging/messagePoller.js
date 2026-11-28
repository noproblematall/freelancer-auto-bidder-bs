const cron = require('node-cron');
const prisma = require('../../config/database');
const { createFreelancerClient } = require('../freelancer/client');
const { getThreadsSince, sendMessage } = require('../freelancer/messages');
const { notifyNewMessage, notifyMeetingDetected } = require('../notifications/telegram');
const { fireWebhook } = require('../notifications/webhook');
const { decrypt, isExpired } = require('../../utils/tokenManager');
const { detectMeeting } = require('../openai/meetingDetector');
const { draftReply } = require('../openai/replyDrafter');
const { createOpenAIClient } = require('../openai/client');
const { recordClientReply } = require('../bidding/outcomes');
const { parseChatIds } = require('../../utils/chatUtils');
const logger = require('../../utils/logger');

let pollCronJob = null;
let isPolling = false; // Guard against concurrent poll runs

// Notifications never replay further back than this after downtime: a day of
// old messages arriving as Telegram pings is noise. Reply TRACKING, however,
// looks back a week (TRACK_LOOKBACK_MS) so a client who wrote while the app
// was closed is still recorded as a reply (bid converted, client saved).
const MAX_LOOKBACK_MS = 30 * 60 * 1000; // 30 minutes
const TRACK_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_REPLY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // at most one automatic reply per thread per day

// Messages Freelancer generates itself (award notices, milestone requests…)
// are not a client talking to us and never get an automatic reply.
const SYSTEM_MESSAGE = /^(the project has been awarded|you have been awarded|milestone|the employer has|this project has been)/i;

/**
 * Poll Freelancer messages for all users with Telegram notifications enabled.
 * Runs every 2 minutes.
 */
async function pollMessages() {
  if (isPolling) {
    logger.warn('MessagePoller: previous poll still in progress, skipping');
    return;
  }

  isPolling = true;
  try {
    await _doPollMessages();
  } finally {
    isPolling = false;
  }
}

async function _doPollMessages() {
  let usersToCheck;
  try {
    usersToCheck = await prisma.user.findMany({
      where: {
        freelancerToken: { isNot: null },
      },
      select: {
        id: true,
        telegramEnabled: true,
        telegramBotToken: true,
        telegramChatId: true,
        webhookEnabled: true,
        webhookUrl: true,
        lastMessageCheckAt: true,
        openaiApiKey: true,
        openaiModel: true,
        scheduleTimezone: true,
        autoReplyEnabled: true,
        skillsSummary: true,
        experienceSummary: true,
        freelancerToken: {
          select: {
            accessToken: true,
            freelancerUid: true,
            expiresAt: true,
          },
        },
      },
    });
  } catch (err) {
    logger.error(`MessagePoller: failed to fetch users: ${err.message}`);
    return;
  }

  if (!usersToCheck || usersToCheck.length === 0) return;

  for (const user of usersToCheck) {
    try {
      await checkUserMessages(user);
    } catch (err) {
      logger.error(`MessagePoller: error for user ${user.id}: ${err.message}`);
    }
  }
}

/**
 * Build the Freelancer project page URL from thread context.
 * context = { type: 'project' | 'contest' | 'support_session', id: number }
 */
function buildProjectUrl(context) {
  if (!context || !context.id) return null;
  const type = context.type === 'contest' ? 'contest' : 'projects';
  return `https://www.freelancer.com/${type}/${context.id}/`;
}

async function checkUserMessages(user) {
  const token = user.freelancerToken;

  // Skip if Freelancer token is expired
  if (isExpired(token.expiresAt)) {
    logger.warn(`MessagePoller: skipping user ${user.id} — Freelancer token expired`);
    return;
  }

  const accessToken = decrypt(token.accessToken);
  const client = createFreelancerClient(accessToken);
  const myUid = String(token.freelancerUid || '');

  // Two windows from lastMessageCheckAt (5 minutes ago on the first run):
  //   - tracking: capped at a week back, so replies that arrived while the
  //     app was closed are still recorded
  //   - notifying: capped at 30 minutes back, so old messages are not replayed
  const rawFromTime = user.lastMessageCheckAt
    ? new Date(user.lastMessageCheckAt)
    : new Date(Date.now() - 5 * 60 * 1000);
  const trackEarliest = new Date(Date.now() - TRACK_LOOKBACK_MS);
  const notifyEarliest = new Date(Date.now() - MAX_LOOKBACK_MS);
  const fromTime = rawFromTime < trackEarliest ? trackEarliest : rawFromTime;
  const fromTimestampSec = Math.floor(fromTime.getTime() / 1000);
  const notifyFromSec = Math.floor(Math.max(rawFromTime.getTime(), notifyEarliest.getTime()) / 1000);
  const catchingUp = rawFromTime < notifyEarliest;
  const nowMs = Date.now();

  let threads, users;
  try {
    ({ threads, users } = await getThreadsSince(client, fromTimestampSec, catchingUp ? 100 : 20));
  } catch (err) {
    logger.error(`MessagePoller: failed to fetch threads for user ${user.id}: ${err.message}`);
    // Do NOT advance lastMessageCheckAt on failure — retry the same window next poll.
    return;
  }

  if (threads.length === 0) {
    // Still advance checkpoint so we don't re-check the same window forever
    await prisma.user.update({
      where: { id: user.id },
      data: { lastMessageCheckAt: new Date(nowMs) },
    });
    return;
  }

  const telegramReady = user.telegramEnabled && user.telegramBotToken && user.telegramChatId;
  const botToken = telegramReady ? decrypt(user.telegramBotToken) : null;
  const chatIds = telegramReady ? parseChatIds(user.telegramChatId) : [];
  const webhookReady = user.webhookEnabled && user.webhookUrl;

  // Create OpenAI client once per user (reused across all threads in this poll cycle)
  const openai = user.openaiApiKey
    ? createOpenAIClient(decrypt(user.openaiApiKey), user.openaiModel || 'gpt-5.4-mini')
    : null;
  const currentISODate = new Date().toISOString().split('T')[0];

  let notified = 0;
  let converted = 0;
  let webhooksFired = 0;

  for (const thread of threads) {
    try {
      const messages = thread.messages || [];
      const threadId = thread.id;

      // Compute full thread timestamps from ALL messages (for MessageThread tracking)
      let lastFromClient = null;
      let lastFromMe = null;
      let lastText = null;
      let clientFlId = null;
      for (const m of messages) {
        const isFromMe = myUid ? String(m.from_user) === myUid : false;
        const ts = new Date(m.time_created * 1000);
        if (isFromMe) {
          if (!lastFromMe || ts > lastFromMe) lastFromMe = ts;
        } else {
          if (!lastFromClient || ts > lastFromClient) {
            lastFromClient = ts;
            lastText = m.message || null;
          }
          if (!clientFlId) clientFlId = Number(m.from_user);
        }
      }

      // Context is at thread.thread.context: { type, id }
      const context = thread.thread?.context;

      // Skip support/system threads entirely — don't track them in MessageThreads
      if (context && context.type !== 'project' && context.type !== 'contest') {
        continue;
      }

      // Look up project in local DB (needed for MessageThread.projectId)
      let projectTitle = null;
      let localProjectId = null;
      let localProject = null;
      if (context?.type === 'project' && context.id) {
        localProject = await prisma.project.findUnique({
          where: { freelancerProjectId: context.id },
          select: { id: true, title: true, description: true },
        }).catch(() => null);
        projectTitle = localProject?.title || null;
        localProjectId = localProject?.id || null;
      }

      // Upsert MessageThread — runs for every polled thread regardless of newIncoming
      if (threadId) {
        await prisma.messageThread.upsert({
          where: { userId_freelancerThreadId: { userId: user.id, freelancerThreadId: threadId } },
          update: {
            ...(lastFromClient !== null && { lastMessageFromClientAt: lastFromClient }),
            ...(lastFromMe !== null && { lastMessageFromMeAt: lastFromMe }),
            ...(lastText !== null && { lastMessageText: lastText }),
            updatedAt: new Date(),
          },
          create: {
            userId: user.id,
            freelancerThreadId: threadId,
            projectId: localProjectId,
            clientFreelancerId: clientFlId,
            lastMessageFromClientAt: lastFromClient,
            lastMessageFromMeAt: lastFromMe,
            lastMessageText: lastText,
          },
        }).catch(e => logger.warn(`MessagePoller: failed to upsert MessageThread ${threadId}: ${e.message}`));
      }

      // Filter to messages received since our last check, from other users only
      const newIncoming = messages.filter((m) => {
        const isFromOther = myUid ? String(m.from_user) !== myUid : true;
        const isNew = m.time_created >= fromTimestampSec;
        return isFromOther && isNew;
      });

      if (newIncoming.length === 0) continue;

      // Newest of the new messages (do not rely on the API's ordering).
      const latestMsg = newIncoming.reduce((a, m) => ((m.time_created || 0) > (a.time_created || 0) ? m : a), newIncoming[0]);
      const senderId = String(latestMsg.from_user);
      const senderUser = users[senderId];
      const senderName = senderUser?.display_name
        || senderUser?.public_name
        || senderUser?.username
        || `User #${senderId}`;

      // Record the client's reply on the bid (converts a placed bid, saves the
      // client) — shared with outcomeSync so both paths behave the same.
      let bidOnProject = null;
      if (localProjectId) {
        bidOnProject = await prisma.bid.findFirst({
          where: { userId: user.id, projectId: localProjectId, status: { in: ['placed', 'converted'] } },
          orderBy: { id: 'desc' },
          select: { id: true, status: true, amount: true, projectId: true, clientRepliedAt: true, proposalText: true, profileId: true },
        }).catch(() => null);
        if (bidOnProject) {
          const earliest = newIncoming.reduce((a, m) => (m.time_created < a ? m.time_created : a), newIncoming[0].time_created);
          const first = await recordClientReply({
            userId: user.id, bid: bidOnProject, at: new Date(earliest * 1000),
            sender: { id: Number(senderId), displayName: senderName !== `User #${senderId}` ? senderName : null, username: senderUser?.username || null, country: senderUser?.location?.country?.code || null },
          });
          if (first) converted++;
        }
      }

      // Only messages inside the notify window get Telegram/webhook/replies;
      // older ones (found while catching up after downtime) are tracked only.
      if (latestMsg.time_created < notifyFromSec) continue;

      // Draft an answer when the client wrote on a project we bid on, and send
      // it when automatic replies are on (first client message of the day in
      // the thread, not a Freelancer system notice, nothing sent by us since).
      let draft = null;
      let autoReplied = false;
      if (openai && bidOnProject && localProject && threadId) {
        try {
          const recent = messages
            .slice()
            .sort((a, b) => a.time_created - b.time_created)
            .slice(-6)
            .map((m) => ({ fromMe: myUid ? String(m.from_user) === myUid : false, text: m.message || '' }));
          draft = await draftReply(openai, {
            project: localProject, proposalText: bidOnProject.proposalText, recent,
            profile: { skillsSummary: user.skillsSummary, experienceSummary: user.experienceSummary },
          });
          const threadRow = await prisma.messageThread.findUnique({
            where: { userId_freelancerThreadId: { userId: user.id, freelancerThreadId: threadId } },
            select: { autoRepliedAt: true },
          }).catch(() => null);
          const clientSpokeLast = !lastFromMe || (lastFromClient && lastFromClient > lastFromMe);
          const cooledDown = !threadRow?.autoRepliedAt || (Date.now() - new Date(threadRow.autoRepliedAt).getTime()) > AUTO_REPLY_COOLDOWN_MS;
          const isSystem = SYSTEM_MESSAGE.test(String(latestMsg.message || '').trim());
          if (user.autoReplyEnabled && draft && clientSpokeLast && cooledDown && !isSystem) {
            await sendMessage(client, threadId, draft);
            autoReplied = true;
            await prisma.activityLog.create({
              data: { userId: user.id, action: 'auto_reply_sent', details: JSON.stringify({ bidId: bidOnProject.id, projectId: localProjectId, threadId, message: draft }) },
            }).catch(() => {});
            logger.info(`MessagePoller: automatic reply sent in thread ${threadId} (project #${localProjectId})`);
          }
          await prisma.messageThread.update({
            where: { userId_freelancerThreadId: { userId: user.id, freelancerThreadId: threadId } },
            data: { draftReply: draft, ...(autoReplied && { autoRepliedAt: new Date(), lastMessageFromMeAt: new Date() }) },
          }).catch(() => {});
        } catch (replyErr) {
          logger.warn(`MessagePoller: reply drafting failed for thread ${threadId}: ${replyErr.message}`);
        }
      }

      // Detect meeting requests in the message
      if (openai) {
        try {
          const meeting = await detectMeeting(openai, latestMsg.message || '', {
            projectTitle: projectTitle || 'Project',
            currentISODate,
            timezone: user.scheduleTimezone || 'UTC',
          });

          if (meeting) {
            // Check for duplicate (same user, same title, same startTime ±10 min)
            const tenMin = 10 * 60 * 1000;
            const existing = await prisma.meeting.findFirst({
              where: {
                userId: user.id,
                startTime: {
                  gte: new Date(new Date(meeting.startTime).getTime() - tenMin),
                  lte: new Date(new Date(meeting.startTime).getTime() + tenMin),
                },
              },
            });

            if (!existing) {
              const saved = await prisma.meeting.create({
                data: {
                  userId: user.id,
                  projectId: localProjectId,
                  title: meeting.title,
                  startTime: new Date(meeting.startTime),
                  endTime: meeting.endTime ? new Date(meeting.endTime) : null,
                  notes: meeting.notes,
                },
              });

              logger.info(`MessagePoller: meeting detected — "${meeting.title}" at ${meeting.startTime} (id: ${saved.id})`);

              // Telegram notification with Google Calendar link
              if (telegramReady) {
                const start = new Date(meeting.startTime);
                const end = new Date(meeting.endTime || new Date(start.getTime() + 60 * 60 * 1000));
                const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
                const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE` +
                  `&text=${encodeURIComponent(meeting.title)}` +
                  `&dates=${fmt(start)}/${fmt(end)}` +
                  (meeting.notes ? `&details=${encodeURIComponent(meeting.notes)}` : '');

                const projectUrl = buildProjectUrl(context);
                for (const chatId of chatIds) {
                  notifyMeetingDetected({
                    botToken, chatId,
                    title: meeting.title,
                    startTime: meeting.startTime,
                    endTime: meeting.endTime,
                    projectTitle,
                    projectUrl,
                    notes: meeting.notes,
                    googleCalUrl: gcalUrl,
                  }).catch(e => logger.warn(`Telegram meeting notification failed: ${e.message}`));
                }
              }
            }
          }
        } catch (meetErr) {
          logger.warn(`MessagePoller: meeting detection failed: ${meetErr.message}`);
        }
      }

      const projectUrl = buildProjectUrl(context);
      const messageText = latestMsg.message || '';
      const threadUrl = `https://www.freelancer.com/messages/thread/${thread.id}`;

      // User-configured webhook — independent of Telegram. fireWebhook never
      // throws, so a dead endpoint can't break the poll loop.
      if (webhookReady) {
        const result = await fireWebhook(user.webhookUrl, 'message.received', {
          senderId: Number(senderId),
          senderName,
          message: messageText,
          projectTitle,
          projectUrl,
          threadId,
          threadUrl,
          receivedAt: new Date(latestMsg.time_created * 1000).toISOString(),
          newMessageCount: newIncoming.length,
        });
        if (result.ok) webhooksFired++;
      }

      if (!telegramReady) continue;

      for (const chatId of chatIds) {
        await notifyNewMessage({
          botToken,
          chatId,
          senderName,
          projectTitle,
          projectUrl,
          messageText,
          threadUrl,
          draftReply: draft,
          autoReplied,
        });
      }
      notified++;
    } catch (err) {
      logger.warn(`MessagePoller: error processing thread ${thread.id}: ${err.message}`);
    }
  }

  if (converted > 0) {
    logger.info(`MessagePoller: recorded ${converted} client repl${converted === 1 ? 'y' : 'ies'} for user ${user.id}${catchingUp ? ' (catching up after downtime)' : ''}`);
  }
  if (notified > 0) {
    logger.info(`MessagePoller: sent ${notified} notification(s) for user ${user.id}`);
  }
  if (webhooksFired > 0) {
    logger.info(`MessagePoller: fired ${webhooksFired} webhook(s) for user ${user.id}`);
  }

  // Advance checkpoint after successful fetch
  await prisma.user.update({
    where: { id: user.id },
    data: { lastMessageCheckAt: new Date(nowMs) },
  });
}

function startPoller(cronExpression = '*/2 * * * *') {
  if (pollCronJob) {
    logger.warn('MessagePoller: already running');
    return;
  }
  logger.info(`MessagePoller: starting (${cronExpression})`);
  pollCronJob = cron.schedule(cronExpression, pollMessages);
}

function stopPoller() {
  if (pollCronJob) {
    pollCronJob.stop();
    pollCronJob = null;
    logger.info('MessagePoller: stopped');
  }
}

module.exports = { startPoller, stopPoller, pollMessages };
