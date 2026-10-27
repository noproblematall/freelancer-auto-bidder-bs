const express = require('express');
const authMiddleware = require('../middleware/auth');
const prisma = require('../config/database');

const router = express.Router();

router.use(authMiddleware);

// GET /api/meetings — list meetings, optionally filtered by year+month
router.get('/', async (req, res, next) => {
  try {
    const where = { userId: req.userId };

    if (req.query.year && req.query.month) {
      const year = parseInt(req.query.year);
      const month = parseInt(req.query.month); // 1-based
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: 'Invalid year or month' });
      }
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      where.startTime = { gte: start, lt: end };
    }

    const meetings = await prisma.meeting.findMany({
      where,
      orderBy: { startTime: 'asc' },
      include: {
        project: { select: { title: true, freelancerProjectId: true } },
      },
    });

    res.json(meetings.map(m => ({
      id: m.id,
      title: m.title,
      startTime: m.startTime,
      endTime: m.endTime,
      notes: m.notes,
      reminderSent: m.reminderSent,
      createdAt: m.createdAt,
      projectTitle: m.project?.title || null,
      projectUrl: m.project?.freelancerProjectId
        ? `https://www.freelancer.com/projects/${m.project.freelancerProjectId}`
        : null,
    })));
  } catch (err) {
    next(err);
  }
});

// POST /api/meetings — create a meeting
router.post('/', async (req, res, next) => {
  try {
    const { title, startTime, endTime, notes } = req.body;
    if (!title || !startTime) {
      return res.status(400).json({ error: 'title and startTime are required' });
    }
    if (isNaN(new Date(startTime).getTime())) {
      return res.status(400).json({ error: 'Invalid startTime' });
    }
    if (endTime && isNaN(new Date(endTime).getTime())) {
      return res.status(400).json({ error: 'Invalid endTime' });
    }

    const meeting = await prisma.meeting.create({
      data: {
        userId: req.userId,
        title,
        startTime: new Date(startTime),
        endTime: endTime ? new Date(endTime) : null,
        notes: notes || null,
      },
    });

    res.status(201).json(meeting);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/meetings/:id — update a meeting
router.patch('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const { title, startTime, endTime, notes } = req.body;

    if (startTime !== undefined && isNaN(new Date(startTime).getTime())) {
      return res.status(400).json({ error: 'Invalid startTime' });
    }
    if (endTime && isNaN(new Date(endTime).getTime())) {
      return res.status(400).json({ error: 'Invalid endTime' });
    }

    const data = {
      ...(title !== undefined && { title }),
      ...(startTime !== undefined && { startTime: new Date(startTime), reminderSent: false }),
      ...(endTime !== undefined && { endTime: endTime ? new Date(endTime) : null }),
      ...(notes !== undefined && { notes: notes || null }),
    };

    // Single query: update only if it belongs to this user
    const result = await prisma.meeting.updateMany({
      where: { id, userId: req.userId },
      data,
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const meeting = await prisma.meeting.findUnique({ where: { id } });
    res.json(meeting);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/meetings/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    // Single query: delete only if it belongs to this user
    const result = await prisma.meeting.deleteMany({
      where: { id, userId: req.userId },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
