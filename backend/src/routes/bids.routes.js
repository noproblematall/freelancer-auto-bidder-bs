const express = require('express');
const prisma = require('../config/database');
const authMiddleware = require('../middleware/auth');
const flClient = require('../middleware/freelancerClient');
const { placeBid, retractBid } = require('../services/freelancer/bids');
const logger = require('../utils/logger');

const router = express.Router();

router.use(authMiddleware);

const BID_PROJECT_INCLUDE = {
  project: {
    select: { id: true, freelancerProjectId: true, title: true, budgetMin: true, budgetMax: true, currency: true, status: true, ownerCountry: true, projectType: true },
  },
  profile: {
    select: { id: true, name: true },
  },
};

// GET /api/bids/stats — Bid statistics (must be before /:id)
router.get('/stats', async (req, res, next) => {
  try {
    const where = { userId: req.userId };
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Optional period filter (7d / 30d / 90d) scopes all counts to that window
    const { period } = req.query;
    const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : null;
    if (periodDays) {
      where.createdAt = { gte: new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000) };
    }

    const [total, placed, converted, rejected, retracted, errored, last24h, thisHour, pendingReview] = await Promise.all([
      prisma.bid.count({ where }),
      prisma.bid.count({ where: { ...where, status: 'placed' } }),
      prisma.bid.count({ where: { ...where, status: 'converted' } }),
      prisma.bid.count({ where: { ...where, status: 'rejected' } }),
      prisma.bid.count({ where: { ...where, status: 'retracted' } }),
      prisma.bid.count({ where: { ...where, status: 'error' } }),
      prisma.bid.count({ where: { ...where, placedAt: { gte: last24Hours, not: null } } }),
      prisma.bid.count({ where: { ...where, placedAt: { gte: oneHourAgo, not: null } } }),
      // Awaiting approval (review-and-send mode) — not period-scoped filters aside
      prisma.bid.count({ where: { ...where, status: 'pending_review' } }),
    ]);

    // Per-profile rate-limit usage so the frontend can show warnings
    const activeProfiles = await prisma.biddingProfile.findMany({
      where: { userId: req.userId, isActive: true },
      select: { id: true, name: true, maxBidsPerHour: true, maxBidsPerDay: true },
    });

    // Mirror the engine's cap accounting: queued review drafts count too.
    const profileLimits = await Promise.all(activeProfiles.map(async (p) => {
      const [hourCount, dayCount] = await Promise.all([
        prisma.bid.count({ where: { profileId: p.id, OR: [
          { status: 'placed', placedAt: { gte: oneHourAgo } },
          { status: 'pending_review', createdAt: { gte: oneHourAgo } },
        ] } }),
        prisma.bid.count({ where: { profileId: p.id, OR: [
          { status: 'placed', placedAt: { gte: last24Hours } },
          { status: 'pending_review', createdAt: { gte: last24Hours } },
        ] } }),
      ]);
      return {
        profileId: p.id,
        profileName: p.name,
        hourly: { used: hourCount, limit: p.maxBidsPerHour, atLimit: hourCount >= p.maxBidsPerHour },
        daily: { used: dayCount, limit: p.maxBidsPerDay, atLimit: dayCount >= p.maxBidsPerDay },
      };
    }));

    res.json({ total, placed, converted, rejected, retracted, errored, last24h, thisHour, pendingReview, profileLimits });
  } catch (err) {
    next(err);
  }
});

// GET /api/bids/history — Time-series bid data for charts
router.get('/history', async (req, res, next) => {
  try {
    const { period = '7d', groupBy = 'day' } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate;
    switch (period) {
      case '7d':
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
    }

    const bids = await prisma.bid.findMany({
      where: {
        userId: req.userId,
        createdAt: { gte: startDate },
      },
      select: {
        id: true,
        status: true,
        amount: true,
        createdAt: true,
        placedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date, filling every date in the range with zeros so the chart
    // always has a complete x-axis with no gaps or missing grid lines.
    const grouped = groupBidsByDate(bids, groupBy, startDate, now);

    // Calculate status distribution
    const statusDistribution = bids.reduce((acc, bid) => {
      acc[bid.status] = (acc[bid.status] || 0) + 1;
      return acc;
    }, {});

    res.json({ history: grouped, statusDistribution, totalBids: bids.length });
  } catch (err) {
    next(err);
  }
});

// Helper function to group bids by date.
// Pre-fills every date in [startDate, endDate] with zero values so the chart
// always has a continuous x-axis — no gaps, no missing grid lines.
function groupBidsByDate(bids, groupBy, startDate, endDate) {
  const emptyBucket = () => ({ total: 0, placed: 0, converted: 0, rejected: 0, pending: 0, retracted: 0, error: 0 });

  const groups = {};

  // Pre-fill the full date range with zeros
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
    groups[key] = { date: key, ...emptyBucket() };
    cursor.setDate(cursor.getDate() + 1);
  }

  bids.forEach((bid) => {
    const date = new Date(bid.createdAt);
    const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

    if (!groups[key]) {
      groups[key] = { date: key, ...emptyBucket() };
    }

    groups[key].total++;
    groups[key][bid.status] = (groups[key][bid.status] || 0) + 1;
  });

  return Object.values(groups);
}

function pad(num) {
  return String(num).padStart(2, '0');
}

// GET /api/bids — List user's bids
router.get('/', async (req, res, next) => {
  try {
    const {
      status, profileId, since, search,
      sortBy = 'createdAt', sortOrder = 'desc',
      limit = '20', offset = '0',
    } = req.query;

    const where = { userId: req.userId };
    if (status && status !== 'all') where.status = status;
    if (profileId) where.profileId = parseInt(profileId);
    if (since === '1h') { where.status = 'placed'; where.placedAt = { gte: new Date(Date.now() - 60 * 60 * 1000) }; }
    else if (since === '24h') { where.status = 'placed'; where.placedAt = { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }; }
    if (search) where.project = { title: { contains: search } };

    const allowedSorts = ['createdAt', 'amount', 'placedAt'];
    const orderField = allowedSorts.includes(sortBy) ? sortBy : 'createdAt';

    const [bids, totalCount] = await Promise.all([
      prisma.bid.findMany({
        where,
        include: BID_PROJECT_INCLUDE,
        orderBy: { [orderField]: sortOrder === 'asc' ? 'asc' : 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.bid.count({ where }),
    ]);

    res.json({ bids, totalCount, offset: parseInt(offset), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/bids/:id — Single bid
router.get('/:id', async (req, res, next) => {
  try {
    const bid = await prisma.bid.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
      include: BID_PROJECT_INCLUDE,
    });
    if (!bid) return res.status(404).json({ error: 'Bid not found' });
    res.json({ bid });
  } catch (err) {
    next(err);
  }
});

// POST /api/bids — Manual bid placement
router.post('/', flClient, async (req, res, next) => {
  try {
    const { projectId, amount, periodDays, milestonePercentage = 100, proposalText } = req.body;

    if (!projectId || !amount || !periodDays || !proposalText) {
      return res.status(400).json({ error: 'Missing required fields: projectId, amount, periodDays, proposalText' });
    }
    // Mirror the PATCH edit validation — without this, an over-long proposal is
    // accepted here, rejected by Freelancer, and lands as an error bid that
    // retries can never fix.
    if (String(proposalText).trim().length > 1500) {
      return res.status(400).json({ error: 'Proposal must be 1500 characters or fewer' });
    }
    const amountNum = parseFloat(amount);
    const periodNum = parseInt(periodDays);
    const milestoneNum = parseInt(milestonePercentage);
    if (isNaN(amountNum) || amountNum <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (isNaN(periodNum) || periodNum < 1) return res.status(400).json({ error: 'Invalid delivery period (days)' });
    if (isNaN(milestoneNum) || milestoneNum < 0 || milestoneNum > 100) {
      return res.status(400).json({ error: 'Milestone percentage must be between 0 and 100' });
    }

    // Look up the project
    const project = await prisma.project.findUnique({ where: { id: parseInt(projectId) } });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // One bid per project: a second Freelancer bid would be rejected anyway, and
    // a duplicate DB record inflates stats. Covers drafts the engine queued too.
    const existingBid = await prisma.bid.findFirst({
      where: { userId: req.userId, projectId: project.id },
      select: { id: true, status: true },
    });
    if (existingBid) {
      const label = existingBid.status === 'pending_review' ? 'a draft waiting for review' : `a bid (${existingBid.status})`;
      return res.status(409).json({ error: `You already have ${label} on this project. Check the Bid History page.` });
    }

    // Get the user's Freelancer UID
    const token = await prisma.freelancerToken.findUnique({ where: { userId: req.userId } });
    if (!token?.freelancerUid) {
      return res.status(400).json({ error: 'Freelancer account not connected or missing user ID' });
    }

    const userRow = await prisma.user.findUnique({ where: { id: req.userId }, select: { sealBids: true } });

    // Create a pending bid record
    const bidRecord = await prisma.bid.create({
      data: {
        userId: req.userId,
        projectId: project.id,
        amount: amountNum,
        periodDays: periodNum,
        milestonePercentage: milestoneNum,
        proposalText,
        status: 'pending',
      },
    });

    try {
      // Place bid via Freelancer API
      const flResult = await placeBid(req.flClient, {
        projectId: project.freelancerProjectId,
        bidderId: parseInt(token.freelancerUid),
        amount: amountNum,
        period: periodNum,
        milestonePercentage: milestoneNum,
        description: proposalText,
        sealed: !!userRow?.sealBids,
      });

      // Update with success
      const updatedBid = await prisma.bid.update({
        where: { id: bidRecord.id },
        data: {
          freelancerBidId: flResult.id,
          status: 'placed',
          placedAt: new Date(),
        },
        include: BID_PROJECT_INCLUDE,
      });

      await prisma.activityLog.create({
        data: {
          userId: req.userId,
          action: 'bid_placed',
          details: JSON.stringify({
            bidId: bidRecord.id,
            projectId: project.id,
            amount: parseFloat(amount),
            freelancerBidId: flResult.id,
          }),
        },
      });

      logger.info(`Manual bid placed: project #${project.id}, $${amount}`);
      res.status(201).json({ bid: updatedBid });
    } catch (placeErr) {
      // Update with error
      const failedBid = await prisma.bid.update({
        where: { id: bidRecord.id },
        data: { status: 'error', errorMessage: placeErr.message },
        include: BID_PROJECT_INCLUDE,
      });

      await prisma.activityLog.create({
        data: {
          userId: req.userId,
          action: 'bid_error',
          details: JSON.stringify({
            bidId: bidRecord.id,
            projectId: project.id,
            error: placeErr.message,
          }),
        },
      });

      logger.error(`Manual bid failed: project #${project.id}, error: ${placeErr.message}`);
      res.status(422).json({ bid: failedBid, error: `Bid placement failed: ${placeErr.message}` });
    }
  } catch (err) {
    next(err);
  }
});

// PATCH /api/bids/:id/convert — Manually mark a placed bid as converted
router.patch('/:id/convert', async (req, res, next) => {
  try {
    const bid = await prisma.bid.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!bid) return res.status(404).json({ error: 'Bid not found' });
    if (bid.status !== 'placed') {
      return res.status(400).json({ error: `Cannot mark bid as converted — current status is "${bid.status}". Only placed bids can be converted.` });
    }

    const updatedBid = await prisma.bid.update({
      where: { id: bid.id },
      data: { status: 'converted' },
      include: BID_PROJECT_INCLUDE,
    });

    await prisma.activityLog.create({
      data: {
        userId: req.userId,
        action: 'bid_converted',
        details: JSON.stringify({ bidId: bid.id, projectId: bid.projectId }),
      },
    });

    logger.info(`Bid #${bid.id} marked as converted`);
    res.json({ bid: updatedBid });
  } catch (err) {
    next(err);
  }
});

// PUT /api/bids/:id/retract — Retract a placed bid
router.put('/:id/retract', flClient, async (req, res, next) => {
  try {
    const bid = await prisma.bid.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!bid) return res.status(404).json({ error: 'Bid not found' });
    if (bid.status !== 'placed') {
      return res.status(400).json({ error: `Cannot retract bid with status "${bid.status}". Only placed bids can be retracted.` });
    }
    if (!bid.freelancerBidId) {
      return res.status(400).json({ error: 'Bid has no Freelancer ID — cannot retract' });
    }

    await retractBid(req.flClient, bid.freelancerBidId);

    const updatedBid = await prisma.bid.update({
      where: { id: bid.id },
      data: { status: 'retracted' },
      include: BID_PROJECT_INCLUDE,
    });

    await prisma.activityLog.create({
      data: {
        userId: req.userId,
        action: 'bid_retracted',
        details: JSON.stringify({
          bidId: bid.id,
          projectId: bid.projectId,
          freelancerBidId: bid.freelancerBidId,
        }),
      },
    });

    logger.info(`Bid #${bid.id} retracted`);
    res.json({ bid: updatedBid });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/bids/:id — Edit a queued or failed bid (proposal text, amount,
// period). Drafts (pending / pending_review) are edited before approval; error
// bids are editable so a rejected proposal (e.g. over-long) can be fixed and
// then retried — otherwise they're a dead end.
router.patch('/:id', async (req, res, next) => {
  try {
    const bid = await prisma.bid.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!bid) return res.status(404).json({ error: 'Bid not found' });
    if (!['pending', 'pending_review', 'error'].includes(bid.status)) {
      return res.status(400).json({ error: `Cannot edit bid with status "${bid.status}". Only queued or failed bids can be edited.` });
    }

    const data = {};
    if (req.body.proposalText !== undefined) {
      const text = String(req.body.proposalText).trim();
      if (!text) return res.status(400).json({ error: 'Proposal text cannot be empty' });
      if (text.length > 1500) return res.status(400).json({ error: 'Proposal must be 1500 characters or fewer' });
      data.proposalText = text;
    }
    if (req.body.amount !== undefined) {
      const amount = parseFloat(req.body.amount);
      if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
      data.amount = amount;
    }
    if (req.body.periodDays !== undefined) {
      const period = parseInt(req.body.periodDays);
      if (isNaN(period) || period < 1) return res.status(400).json({ error: 'Invalid period' });
      data.periodDays = period;
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update' });

    const updatedBid = await prisma.bid.update({
      where: { id: bid.id },
      data,
      include: BID_PROJECT_INCLUDE,
    });
    logger.info(`Bid #${bid.id} edited by user (${Object.keys(data).join(', ')})`);
    res.json({ bid: updatedBid });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/bids/:id/cancel — Cancel a pending bid before it is placed
router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const bid = await prisma.bid.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
    });
    if (!bid) return res.status(404).json({ error: 'Bid not found' });
    if (bid.status !== 'pending' && bid.status !== 'pending_review') {
      return res.status(400).json({ error: `Cannot cancel bid with status "${bid.status}". Only pending or pending-review bids can be cancelled.` });
    }

    const updatedBid = await prisma.bid.update({
      where: { id: bid.id },
      data: { status: 'cancelled' },
      include: BID_PROJECT_INCLUDE,
    });

    await prisma.activityLog.create({
      data: {
        userId: req.userId,
        action: 'bid_cancelled',
        details: JSON.stringify({ bidId: bid.id, projectId: bid.projectId }),
      },
    });

    logger.info(`Bid #${bid.id} cancelled by user`);
    res.json({ bid: updatedBid });
  } catch (err) {
    next(err);
  }
});

// POST /api/bids/:id/place-now — Force-place a stuck pending bid immediately
router.post('/:id/place-now', flClient, async (req, res, next) => {
  try {
    const bid = await prisma.bid.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
      include: { project: true, profile: true },
    });

    if (!bid) return res.status(404).json({ error: 'Bid not found' });
    if (bid.status !== 'pending' && bid.status !== 'pending_review') {
      return res.status(400).json({ error: `Cannot place bid with status "${bid.status}". Only pending or pending-review bids can be placed.` });
    }
    if (!bid.project) return res.status(400).json({ error: 'Project not found for this bid' });
    if (!bid.profile) return res.status(400).json({ error: 'Profile not found for this bid' });

    const tokenRecord = await prisma.freelancerToken.findUnique({ where: { userId: req.userId } });
    if (!tokenRecord?.freelancerUid) {
      return res.status(400).json({ error: 'Freelancer user ID not found' });
    }

    // Safety check: ensure bid is not already live on Freelancer. A RETRACTED
    // bid of ours also comes back from this endpoint — it must not count as
    // "live", or recovery would mark a dead bid as placed without re-placing.
    if (bid.project.freelancerProjectId) {
      try {
        const { getBids } = require('../services/freelancer/bids');
        const existing = await getBids(req.flClient, {
          projectIds: [bid.project.freelancerProjectId],
          limit: 50,
        });
        const bidderId = String(tokenRecord.freelancerUid);
        const liveBid = (existing.bids || []).find(b => String(b.bidder_id) === bidderId && !b.retracted);
        if (liveBid) {
          const recovered = await prisma.bid.update({
            where: { id: bid.id },
            data: {
              status: 'placed',
              freelancerBidId: liveBid.id || bid.freelancerBidId,
              placedAt: bid.placedAt || new Date(),
            },
            include: BID_PROJECT_INCLUDE,
          });
          logger.info(`Bid #${bid.id} (pending) recovered — already live on Freelancer`);
          return res.json({ bid: recovered, message: 'Bid was already placed on Freelancer — recovered successfully' });
        }
      } catch (checkErr) {
        logger.warn(`Bid #${bid.id} pre-place-now Freelancer check failed: ${checkErr.message} — proceeding`);
      }
    }

    const userRow = await prisma.user.findUnique({ where: { id: req.userId }, select: { sealBids: true } });

    try {
      const flResult = await placeBid(req.flClient, {
        projectId: bid.project.freelancerProjectId,
        bidderId: parseInt(tokenRecord.freelancerUid),
        amount: bid.amount,
        period: bid.periodDays,
        milestonePercentage: bid.milestonePercentage,
        description: bid.proposalText,
        sealed: !!userRow?.sealBids,
      });

      const updatedBid = await prisma.bid.update({
        where: { id: bid.id },
        data: { status: 'placed', freelancerBidId: flResult.id, placedAt: new Date() },
        include: BID_PROJECT_INCLUDE,
      });

      prisma.activityLog.create({
        data: {
          userId: req.userId,
          action: 'bid_placed_manual',
          details: JSON.stringify({ bidId: bid.id, projectId: bid.projectId, freelancerBidId: flResult.id }),
        },
      }).catch(() => {});

      logger.info(`Bid #${bid.id} force-placed by user`);
      res.json({ bid: updatedBid, message: 'Bid placed successfully' });
    } catch (placementError) {
      const errorMessage = placementError.response?.data?.message || placementError.message || 'Failed to place bid';
      // "Already bid" from Freelancer means a live bid exists (e.g. the engine
      // placed it in a race window) — record success, not a scary error row.
      if (/already.*(bid|placed)/i.test(errorMessage)) {
        const recovered = await prisma.bid.update({
          where: { id: bid.id },
          data: { status: 'placed', placedAt: bid.placedAt || new Date(), errorMessage: null },
          include: BID_PROJECT_INCLUDE,
        });
        logger.info(`Bid #${bid.id} place-now hit "already bid" — recovered as placed`);
        return res.json({ bid: recovered, message: 'Bid was already placed on Freelancer — recovered successfully' });
      }
      const updatedBid = await prisma.bid.update({
        where: { id: bid.id },
        data: { status: 'error', errorMessage },
        include: BID_PROJECT_INCLUDE,
      });
      logger.error(`Bid #${bid.id} force-place failed: ${errorMessage}`);
      res.status(400).json({ bid: updatedBid, error: errorMessage });
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/bids/:id/retry — Retry a failed bid
router.post('/:id/retry', flClient, async (req, res, next) => {
  try {
    const bid = await prisma.bid.findFirst({
      where: { id: parseInt(req.params.id), userId: req.userId },
      include: {
        project: true,
        profile: true,
      },
    });

    if (!bid) return res.status(404).json({ error: 'Bid not found' });

    // Only allow retrying error or retracted status bids
    if (bid.status !== 'error' && bid.status !== 'retracted') {
      return res.status(400).json({ error: `Cannot retry bid with status "${bid.status}". Only failed or retracted bids can be retried.` });
    }

    // Don't retry if error message clearly indicates it was already placed
    if (bid.errorMessage && bid.errorMessage.toLowerCase().includes('already placed')) {
      return res.status(400).json({ error: 'Cannot retry - bid was already placed on this project' });
    }

    if (!bid.project) {
      return res.status(400).json({ error: 'Project not found for this bid' });
    }

    if (!bid.profile) {
      return res.status(400).json({ error: 'Profile not found for this bid' });
    }

    // Get Freelancer user ID
    const tokenRecord = await prisma.freelancerToken.findUnique({
      where: { userId: req.userId },
    });
    if (!tokenRecord?.freelancerUid) {
      return res.status(400).json({ error: 'Freelancer user ID not found' });
    }

    // Safety check: verify bid is not already live on Freelancer before retrying.
    // A bid can end up in 'error' state even if it was placed (e.g., server crash between
    // placeBid() succeeding and the DB update running). Placing it again would create a
    // duplicate bid on the project.
    if (bid.project.freelancerProjectId) {
      try {
        const { getBids } = require('../services/freelancer/bids');
        const existing = await getBids(req.flClient, {
          projectIds: [bid.project.freelancerProjectId],
          limit: 50,
        });
        const bidderId = String(tokenRecord.freelancerUid);
        // Ignore our own RETRACTED bid — it is dead, and counting it as live
        // would turn "Retry" into a silent no-op that claims the bid is placed.
        const liveBid = (existing.bids || []).find(b => String(b.bidder_id) === bidderId && !b.retracted);
        if (liveBid) {
          const recovered = await prisma.bid.update({
            where: { id: bid.id },
            data: {
              status: 'placed',
              freelancerBidId: liveBid?.id || bid.freelancerBidId,
              placedAt: bid.placedAt || new Date(),
              errorMessage: null,
            },
            include: BID_PROJECT_INCLUDE,
          });
          logger.info(`Bid #${bid.id} recovered — was already live on Freelancer, marked as placed`);
          return res.json({ bid: recovered, message: 'Bid was already placed on Freelancer — recovered successfully' });
        }
      } catch (checkErr) {
        // If the check itself fails, proceed cautiously and allow the retry
        logger.warn(`Bid #${bid.id} pre-retry Freelancer check failed: ${checkErr.message} — proceeding with retry`);
      }
    }

    // Update bid to pending status
    await prisma.bid.update({
      where: { id: bid.id },
      data: { status: 'pending', errorMessage: null },
    });

    const userRow = await prisma.user.findUnique({ where: { id: req.userId }, select: { sealBids: true } });

    // Attempt to place the bid again
    // COST OPTIMIZATION: Reuse existing proposal (bid.proposalText) instead of regenerating
    // This avoids calling OpenAI API again, saving costs on retry attempts
    try {
      const flResult = await placeBid(req.flClient, {
        projectId: bid.project.freelancerProjectId,
        bidderId: parseInt(tokenRecord.freelancerUid),
        amount: bid.amount,
        period: bid.periodDays,
        milestonePercentage: bid.milestonePercentage,
        description: bid.proposalText, // Reuses existing proposal from DB
        sealed: !!userRow?.sealBids,
      });

      // Update bid with success
      const updatedBid = await prisma.bid.update({
        where: { id: bid.id },
        data: {
          status: 'placed',
          freelancerBidId: flResult.id,
          placedAt: new Date(),
        },
        include: BID_PROJECT_INCLUDE,
      });

      await prisma.activityLog.create({
        data: {
          userId: req.userId,
          action: 'bid_retried_success',
          details: JSON.stringify({
            bidId: bid.id,
            projectId: bid.projectId,
            freelancerBidId: flResult.id,
          }),
        },
      });

      logger.info(`Bid #${bid.id} successfully retried and placed`);
      res.json({ bid: updatedBid, message: 'Bid successfully retried and placed' });
    } catch (placementError) {
      // Update bid with new error
      const errorMessage = placementError.response?.data?.message || placementError.message || 'Failed to place bid';

      const updatedBid = await prisma.bid.update({
        where: { id: bid.id },
        data: {
          status: 'error',
          errorMessage,
        },
        include: BID_PROJECT_INCLUDE,
      });

      await prisma.activityLog.create({
        data: {
          userId: req.userId,
          action: 'bid_retried_failed',
          details: JSON.stringify({
            bidId: bid.id,
            projectId: bid.projectId,
            error: errorMessage,
          }),
        },
      });

      logger.error(`Bid #${bid.id} retry failed: ${errorMessage}`);
      res.status(400).json({ bid: updatedBid, error: errorMessage });
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
