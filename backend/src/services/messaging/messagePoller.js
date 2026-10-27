const cron = require('node-cron');
const prisma = require('../../config/database');
const { createFreelancerClient } = require('../freelancer/client');
const { getThreadsSince } = require('../freelancer/messages');
const { notifyNewMessage, notifyMeetingDetected } = require('../notifications/telegram');
const { fireWebhook } = require('../notifications/webhook');
const { decrypt, isExpired } = require('../../utils/tokenManager');
const { detectMeeting } = require('../openai/meetingDetector');
const { createOpenAIClient } = require('../openai/client');
const { parseChatIds } = require('../../utils/chatUtils');
const logger = require('../../utils/logger');

let pollCronJob = null;
let isPolling = false; // Guard against concurrent poll runs

// Maximum lookback window: don't look further back than this on retries/first run
const MAX_LOOKBACK_MS = 30 * 60 * 1000; // 30 minutes

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

  // Determine from-time:
  //   - Use lastMessageCheckAt if set
  //   - Otherwise default to 5 minutes ago (first run)
  //   - Cap at MAX_LOOKBACK_MS to avoid replaying a large backlog after downtime
  const earliestAllowed = new Date(Date.now() - MAX_LOOKBACK_MS);
  const rawFromTime = user.lastMessageCheckAt
    ? new Date(user.lastMessageCheckAt)
    : new Date(Date.now() - 5 * 60 * 1000);
  const fromTime = rawFromTime < earliestAllowed ? earliestAllowed : rawFromTime;
  const fromTimestampSec = Math.floor(fromTime.getTime() / 1000);
  const nowMs = Date.now();

  let threads, users;
  try {
    ({ threads, users } = await getThreadsSince(client, fromTimestampSec));
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
      if (context?.type === 'project' && context.id) {
        const localProject = await prisma.project.findUnique({
          where: { freelancerProjectId: context.id },
          select: { id: true, title: true },
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

      const latestMsg = newIncoming[0];
      const senderId = String(latestMsg.from_user);
      const senderUser = users[senderId];
      const senderName = senderUser?.display_name
        || senderUser?.public_name
        || senderUser?.username
        || `User #${senderId}`;

      // Auto-convert placed bid on first client message, and upsert Client record
      if (localProjectId) {
        const placedBid = await prisma.bid.findFirst({
          where: { userId: user.id, projectId: localProjectId, status: 'placed' },
          select: { id: true, amount: true },
        }).catch(() => null);

        if (placedBid) {
          await prisma.bid.update({
            where: { id: placedBid.id },
            data: { status: 'converted' },
          });
          await prisma.activityLog.create({
            data: {
              userId: user.id,
              action: 'bid_converted',
              details: JSON.stringify({
                bidId: placedBid.id,
                projectId: localProjectId,
                reason: 'first_client_message',
                senderId,
              }),
            },
          }).catch(() => {});
          logger.info(`MessagePoller: bid #${placedBid.id} auto-converted — first message from client ${senderId} on project #${localProjectId}`);
          converted++;

          // Upsert Client record for converted client
          const senderFlId = Number(senderId);
          const clientDisplayName = senderName !== `User #${senderId}` ? senderName : null;
          const clientUsername = senderUser?.username || null;
          const clientCountry = senderUser?.location?.country?.code || null;
          await prisma.client.upsert({
            where: { userId_freelancerUserId: { userId: user.id, freelancerUserId: senderFlId } },
            update: {
              ...(clientDisplayName && { displayName: clientDisplayName }),
              ...(clientUsername && { username: clientUsername }),
              ...(clientCountry && { country: clientCountry }),
              projectCount: { increment: 1 },
              totalValue: { increment: placedBid.amount || 0 },
              lastProjectAt: new Date(),
              updatedAt: new Date(),
            },
            create: {
              userId: user.id,
              freelancerUserId: senderFlId,
              displayName: clientDisplayName,
              username: clientUsername,
              country: clientCountry,
              projectCount: 1,
              totalValue: placedBid.amount || 0,
              lastProjectAt: new Date(),
            },
          }).catch(e => logger.warn(`MessagePoller: failed to upsert Client ${senderFlId}: ${e.message}`));
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
        });
      }
      notified++;
    } catch (err) {
      logger.warn(`MessagePoller: error processing thread ${thread.id}: ${err.message}`);
    }
  }

  if (converted > 0) {
    logger.info(`MessagePoller: auto-converted ${converted} bid(s) for user ${user.id}`);
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
