const express = require('express');
const prisma = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { sendTelegramMessage } = require('../services/notifications/telegram');
const { fireWebhook } = require('../services/notifications/webhook');
const { decrypt } = require('../utils/tokenManager');
const logger = require('../utils/logger');

const router = express.Router();

// POST /api/notifications/telegram/test — send a test Telegram notification
router.post('/telegram/test', authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { telegramBotToken: true, telegramChatId: true },
    });

    if (!user?.telegramBotToken || !user?.telegramChatId) {
      return res.status(400).json({ error: 'Telegram Bot Token and Chat ID must be configured first' });
    }

    const botToken = decrypt(user.telegramBotToken);
    const chatIds = user.telegramChatId.split(',').map((s) => s.trim()).filter(Boolean);

    for (const chatId of chatIds) {
      await sendTelegramMessage(
        botToken,
        chatId,
        '✅ <b>Growlance connected!</b>\n\nYou will receive notifications here whenever someone sends you a message on Freelancer.'
      );
    }

    logger.info(`User ${req.userId} sent a test Telegram notification`);
    res.json({ success: true });
  } catch (err) {
    logger.error(`Test Telegram notification failed for user ${req.userId}: ${err.message}`);
    const detail = err.response?.data?.description || err.message;
    res.status(400).json({ error: `Failed to send test notification: ${detail}` });
  }
});

// POST /api/notifications/webhook/test — fire a sample event at the saved webhook URL
router.post('/webhook/test', authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { webhookUrl: true },
    });

    if (!user?.webhookUrl) {
      return res.status(400).json({ error: 'Save a webhook URL first' });
    }

    const result = await fireWebhook(user.webhookUrl, 'test', {
      message: 'Growlance webhook connected! You will receive a message.received event whenever someone messages you on Freelancer.',
    });

    if (!result.ok) {
      return res.status(400).json({ error: `Webhook unreachable: ${result.error}` });
    }

    logger.info(`User ${req.userId} sent a test webhook (HTTP ${result.status})`);
    res.json({ success: true, status: result.status });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
