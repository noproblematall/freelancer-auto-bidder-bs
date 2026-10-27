const cron = require('node-cron');
const prisma = require('../../config/database');
const { notifyMeetingReminder } = require('../notifications/telegram');
const { decrypt } = require('../../utils/tokenManager');
const { parseChatIds } = require('../../utils/chatUtils');
const logger = require('../../utils/logger');

let reminderCronJob = null;
let isChecking = false; // Guard against concurrent runs

async function checkMeetingReminders() {
  if (isChecking) {
    logger.warn('meetingReminder: previous check still running, skipping');
    return;
  }
  isChecking = true;
  try {
    await _doCheck();
  } finally {
    isChecking = false;
  }
}

async function _doCheck() {
  // Find meetings starting in 25–35 minutes that haven't had a reminder sent yet
  const windowStart = new Date(Date.now() + 25 * 60 * 1000);
  const windowEnd = new Date(Date.now() + 35 * 60 * 1000);

  const upcoming = await prisma.meeting.findMany({
    where: {
      startTime: { gte: windowStart, lte: windowEnd },
      reminderSent: false,
    },
    include: {
      user: {
        select: {
          telegramEnabled: true,
          telegramBotToken: true,
          telegramChatId: true,
        },
      },
      project: {
        select: { title: true, freelancerProjectId: true },
      },
    },
  });

  if (upcoming.length === 0) return;

  const notifiedIds = [];

  for (const meeting of upcoming) {
    const user = meeting.user;
    if (!user.telegramEnabled || !user.telegramBotToken || !user.telegramChatId) continue;

    let botToken;
    try {
      botToken = decrypt(user.telegramBotToken);
    } catch (e) {
      logger.warn(`meetingReminder: failed to decrypt token for meeting #${meeting.id}: ${e.message}`);
      continue;
    }

    const chatIds = parseChatIds(user.telegramChatId);
    const projectTitle = meeting.project?.title || null;
    const projectUrl = meeting.project?.freelancerProjectId
      ? `https://www.freelancer.com/projects/${meeting.project.freelancerProjectId}`
      : null;

    // Send to all chat IDs in parallel
    const results = await Promise.allSettled(
      chatIds.map(chatId =>
        notifyMeetingReminder({
          botToken, chatId,
          title: meeting.title,
          startTime: meeting.startTime.toISOString(),
          projectTitle,
          projectUrl,
        })
      )
    );

    const anySucceeded = results.some(r => r.status === 'fulfilled');
    if (anySucceeded) {
      notifiedIds.push(meeting.id);
      logger.info(`meetingReminder: reminder sent for meeting #${meeting.id} "${meeting.title}"`);
    } else {
      results.forEach(r => {
        if (r.status === 'rejected') logger.warn(`meetingReminder: notification failed: ${r.reason?.message}`);
      });
    }
  }

  // Batch-update reminderSent only for meetings that were actually notified
  if (notifiedIds.length > 0) {
    await prisma.meeting.updateMany({
      where: { id: { in: notifiedIds } },
      data: { reminderSent: true },
    });
  }
}

function startMeetingReminder() {
  if (reminderCronJob) return;
  reminderCronJob = cron.schedule('* * * * *', checkMeetingReminders);
  logger.info('Meeting reminder service started (checking every minute)');
}

function stopMeetingReminder() {
  if (reminderCronJob) {
    reminderCronJob.stop();
    reminderCronJob = null;
  }
}

module.exports = { startMeetingReminder, stopMeetingReminder };
