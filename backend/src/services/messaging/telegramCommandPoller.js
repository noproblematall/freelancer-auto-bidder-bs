const cron = require('node-cron');
const axios = require('axios');
const prisma = require('../../config/database');
const { decrypt } = require('../../utils/tokenManager');
const { sendTelegramMessage } = require('../notifications/telegram');
const { parseChatIds } = require('../../utils/chatUtils');
const scheduler = require('../bidding/scheduler');
const logger = require('../../utils/logger');

const TELEGRAM_API_BASE = 'https://api.telegram.org';

// In-memory offset per userId — tracks the next update_id to fetch from Telegram.
// Resets on server restart, but initializeOffsets() drains stale commands at startup.
const updateOffsets = new Map();

let commandCronJob = null;

// ─── Telegram getUpdates ──────────────────────────────────────────────────────

async function getUpdates(botToken, offset) {
  const params = { allowed_updates: JSON.stringify(['message']) };
  if (offset > 0) params.offset = offset;
  const response = await axios.get(`${TELEGRAM_API_BASE}/bot${botToken}/getUpdates`, {
    params,
    timeout: 8000,
  });
  return response.data?.result || [];
}

// ─── Startup: drain stale commands ───────────────────────────────────────────

/**
 * On server start, advance each user's offset past all currently-pending updates
 * so that commands sent before the server started are not replayed.
 */
async function initializeOffsets() {
  let users;
  try {
    users = await prisma.user.findMany({
      where: {
        telegramEnabled: true,
        telegramBotToken: { not: null },
        telegramChatId: { not: null },
      },
      select: { id: true, telegramBotToken: true },
    });
  } catch {
    return;
  }

  for (const user of users) {
    try {
      const botToken = decrypt(user.telegramBotToken);
      const updates = await getUpdates(botToken, 0);
      if (updates.length > 0) {
        const nextOffset = updates[updates.length - 1].update_id + 1;
        updateOffsets.set(user.id, nextOffset);
        // Acknowledge the drained updates to Telegram
        await getUpdates(botToken, nextOffset);
        logger.info(`CommandPoller: drained ${updates.length} stale update(s) for user ${user.id}`);
      }
    } catch (err) {
      logger.warn(`CommandPoller: offset init failed for user ${user.id}: ${err.message}`);
    }
  }
}

// ─── Per-poll cycle ───────────────────────────────────────────────────────────

async function pollCommands() {
  let users;
  try {
    users = await prisma.user.findMany({
      where: {
        telegramEnabled: true,
        telegramBotToken: { not: null },
        telegramChatId: { not: null },
      },
      select: { id: true, telegramBotToken: true, telegramChatId: true },
    });
  } catch (err) {
    logger.error(`CommandPoller: failed to fetch users: ${err.message}`);
    return;
  }

  for (const user of users) {
    try {
      await pollUserCommands(user);
    } catch (err) {
      logger.error(`CommandPoller: error for user ${user.id}: ${err.message}`);
    }
  }
}

async function pollUserCommands(user) {
  const botToken = decrypt(user.telegramBotToken);
  const offset = updateOffsets.get(user.id) || 0;

  const updates = await getUpdates(botToken, offset);
  if (updates.length === 0) return;

  for (const update of updates) {
    const msg = update.message;
    if (!msg?.text) continue;

    const fromChatId = String(msg.chat?.id ?? '');
    const text = msg.text.trim();

    // Security: only accept commands from one of the user's configured chat IDs
    const allowedChatIds = new Set(parseChatIds(user.telegramChatId));
    if (!allowedChatIds.has(fromChatId)) continue;

    await handleCommand(botToken, fromChatId, text);
  }

  // Advance offset to acknowledge all processed updates
  updateOffsets.set(user.id, updates[updates.length - 1].update_id + 1);
}

async function handleCommand(botToken, chatId, text) {
  const command = text.split(' ')[0].toLowerCase(); // handle "/start@BotName" style too

  if (command === '/start') {
    const status = scheduler.getStatus();
    if (status.running) {
      await sendTelegramMessage(botToken, chatId,
        '⚡ Growlance is already running.'
      );
    } else {
      scheduler.start();
      await sendTelegramMessage(botToken, chatId,
        '✅ <b>Growlance started!</b>\n\nThe scheduler is now active and will process your bidding profiles every minute.'
      );
    }

  } else if (command === '/stop') {
    const status = scheduler.getStatus();
    if (!status.running) {
      await sendTelegramMessage(botToken, chatId,
        '⚡ Growlance is already stopped.'
      );
    } else {
      scheduler.stop();
      await sendTelegramMessage(botToken, chatId,
        '🛑 <b>Growlance stopped!</b>\n\nNo new bids will be placed until you send /start.'
      );
    }

  } else if (command === '/status') {
    const { running, processing } = scheduler.getStatus();
    const icon = running ? '🟢' : '🔴';
    const label = running
      ? (processing ? 'Running <i>(currently placing bids)</i>' : 'Running')
      : 'Stopped';
    await sendTelegramMessage(botToken, chatId,
      `${icon} <b>Growlance Status:</b> ${label}\n\nCommands: /start · /stop · /status`
    );

  } else if (command === '/help') {
    await sendTelegramMessage(botToken, chatId,
      '🤖 <b>Growlance Bot Commands</b>\n\n' +
      '/start — Enable bidding\n' +
      '/stop — Disable bidding\n' +
      '/status — Show current status'
    );
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

function startCommandPoller() {
  if (commandCronJob) {
    logger.warn('CommandPoller: already running');
    return;
  }

  // Drain stale commands first, then begin polling every 10 seconds
  initializeOffsets()
    .then(() => {
      logger.info('CommandPoller: starting (every 10s)');
      // node-cron supports 6-field expressions (seconds) in v3
      commandCronJob = cron.schedule('*/10 * * * * *', pollCommands);
    })
    .catch((err) => {
      logger.error(`CommandPoller: initialization failed: ${err.message}`);
      commandCronJob = cron.schedule('*/10 * * * * *', pollCommands);
    });
}

function stopCommandPoller() {
  if (commandCronJob) {
    commandCronJob.stop();
    commandCronJob = null;
    logger.info('CommandPoller: stopped');
  }
}

module.exports = { startCommandPoller, stopCommandPoller };
