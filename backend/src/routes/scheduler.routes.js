const express = require('express');
const authMiddleware = require('../middleware/auth');
const scheduler = require('../services/bidding/scheduler');
const { checkGlobalSchedule } = require('../services/bidding/scheduleChecker');
const prisma = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authMiddleware);

// GET /api/scheduler/status — Check scheduler state + schedule window
router.get('/status', async (req, res, next) => {
  try {
    const { running, processing } = scheduler.getStatus();
    const schedule = running ? await checkGlobalSchedule() : { allowed: false, reason: 'Scheduler stopped' };
    res.json({ running, processing, scheduleAllowed: schedule.allowed, scheduleReason: schedule.reason });
  } catch (err) {
    next(err);
  }
});

// POST /api/scheduler/trigger — Manually trigger a run now
router.post('/trigger', async (req, res) => {
  const status = scheduler.getStatus();
  if (status.processing) {
    return res.status(409).json({ error: 'A run is already in progress' });
  }

  logger.info(`Manual scheduler trigger by user ${req.userId}`);
  scheduler.runAllActiveProfiles()
    .catch(err => logger.error(`Manual trigger failed: ${err.message}`));

  res.json({ message: 'Scheduler run triggered' });
});

// POST /api/scheduler/stop — Stop the scheduler
router.post('/stop', (req, res) => {
  scheduler.stop();
  logger.info(`Scheduler stopped by user ${req.userId}`);
  res.json(scheduler.getStatus());
});

// POST /api/scheduler/start — Start the scheduler
router.post('/start', (req, res) => {
  scheduler.start();
  logger.info(`Scheduler started by user ${req.userId}`);
  res.json(scheduler.getStatus());
});

// GET /api/scheduler/activity — Get scheduler activity logs
router.get('/activity', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    // Get scheduler-related activity logs
    const logs = await prisma.activityLog.findMany({
      where: {
        userId: req.userId,
        action: {
          in: ['scheduler_check', 'scheduler_run_completed', 'scheduler_run_failed', 'scheduler_auto_paused', 'openai_stall_detected', 'openai_not_configured', 'token_refresh_failed'],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    // Parse details JSON
    const parsedLogs = logs.map(log => ({
      id: log.id,
      action: log.action,
      details: log.details ? JSON.parse(log.details) : null,
      createdAt: log.createdAt,
    }));

    res.json({
      logs: parsedLogs,
      total: await prisma.activityLog.count({
        where: {
          userId: req.userId,
          action: {
            in: ['scheduler_check', 'scheduler_run_completed', 'scheduler_run_failed', 'scheduler_auto_paused', 'openai_stall_detected', 'openai_not_configured', 'token_refresh_failed'],
          },
        },
      }),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
