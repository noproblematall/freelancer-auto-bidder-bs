const express = require('express');
const authMiddleware = require('../middleware/auth');
const prisma = require('../config/database');

const router = express.Router();

router.use(authMiddleware);

// GET /api/activity — Get all activity logs with pagination and filtering
router.get('/', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const actionFilter = req.query.action; // Optional filter by action type

    const where = { userId: req.userId };

    // Apply action filter if provided
    if (actionFilter && actionFilter !== 'all') {
      // Support filtering by category
      if (actionFilter === 'scheduler') {
        where.action = { in: ['scheduler_check', 'scheduler_run_completed', 'scheduler_run_failed', 'scheduler_auto_paused', 'openai_stall_detected', 'openai_not_configured', 'token_refresh_failed'] };
      } else if (actionFilter === 'bids') {
        where.action = { in: ['bid_placed', 'bid_placed_manual', 'bid_queued_for_review', 'bid_cancelled', 'bid_converted', 'bid_error', 'bid_retracted', 'bid_retried_success', 'bid_retried_failed'] };
      } else if (actionFilter === 'profiles') {
        where.action = { in: ['profile_created', 'profile_updated', 'profile_deleted'] };
      } else {
        // Exact action match
        where.action = actionFilter;
      }
    }

    // Get activity logs
    const [logs, totalCount] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.activityLog.count({ where }),
    ]);

    // Parse details JSON
    const parsedLogs = logs.map(log => ({
      id: log.id,
      action: log.action,
      details: log.details ? JSON.parse(log.details) : null,
      createdAt: log.createdAt,
    }));

    res.json({
      logs: parsedLogs,
      totalCount,
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/activity/stats — Get activity statistics
router.get('/stats', async (req, res, next) => {
  try {
    const where = { userId: req.userId };
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [total, last24h, last7d, byAction] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.count({
        where: { ...where, createdAt: { gte: last24Hours } },
      }),
      prisma.activityLog.count({
        where: { ...where, createdAt: { gte: last7Days } },
      }),
      // Get count by action type
      prisma.activityLog.groupBy({
        by: ['action'],
        where,
        _count: true,
      }),
    ]);

    // Convert byAction to a more readable format
    const actionCounts = {};
    byAction.forEach(item => {
      actionCounts[item.action] = item._count;
    });

    res.json({
      total,
      last24h,
      last7d,
      byAction: actionCounts,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
