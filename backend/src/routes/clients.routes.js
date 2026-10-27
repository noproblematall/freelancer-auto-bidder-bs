const express = require('express')
const router = express.Router()
const prisma = require('../config/database')
const authMiddleware = require('../middleware/auth')
const logger = require('../utils/logger')
const { createFreelancerClient } = require('../services/freelancer/client')
const { getThreadsSince } = require('../services/freelancer/messages')
const { decrypt, isExpired } = require('../utils/tokenManager')

router.use(authMiddleware)

// GET /api/clients — list all converted clients
router.get('/', async (req, res) => {
  try {
    const clients = await prisma.client.findMany({
      where: { userId: req.userId },
      orderBy: { lastProjectAt: 'desc' },
    })

    // For each client, fetch their project history via bids
    const clientsWithHistory = await Promise.all(
      clients.map(async (client) => {
        const bids = await prisma.$queryRaw`
          SELECT b.id, b.amount, b.status, b.placed_at, b.created_at,
                 p.title, p.freelancer_project_id, p.budget_min, p.budget_max
          FROM bids b
          JOIN projects p ON b.project_id = p.id
          WHERE b.user_id = ${req.userId}
            AND b.status IN ('converted', 'placed')
            AND p.owner_id = ${client.freelancerUserId}
          ORDER BY b.placed_at DESC
        `
        return { ...client, projects: bids }
      })
    )

    res.json({ clients: clientsWithHistory })
  } catch (err) {
    logger.error({ err, msg: 'Failed to fetch clients' })
    res.status(500).json({ error: 'Failed to fetch clients' })
  }
})

// GET /api/clients/follow-ups — threads needing attention
router.get('/follow-ups', async (req, res) => {
  try {
    const now = new Date()
    const twelveHoursAgo = new Date(now - 12 * 60 * 60 * 1000)
    const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000)

    const threads = await prisma.messageThread.findMany({
      where: { userId: req.userId },
    })

    const waitingOnMe = []
    const noResponse = []

    for (const thread of threads) {
      const { lastMessageFromClientAt, lastMessageFromMeAt } = thread

      if (
        lastMessageFromClientAt &&
        lastMessageFromClientAt < twelveHoursAgo &&
        (!lastMessageFromMeAt || lastMessageFromMeAt < lastMessageFromClientAt)
      ) {
        waitingOnMe.push(thread)
      } else if (
        lastMessageFromMeAt &&
        lastMessageFromMeAt < fortyEightHoursAgo &&
        (!lastMessageFromClientAt || lastMessageFromClientAt < lastMessageFromMeAt)
      ) {
        noResponse.push(thread)
      }
    }

    res.json({ waitingOnMe, noResponse })
  } catch (err) {
    logger.error({ err, msg: 'Failed to fetch follow-ups' })
    res.status(500).json({ error: 'Failed to fetch follow-ups' })
  }
})

// POST /api/clients/backfill — sync clients from converted bids + message threads via Freelancer API
router.post('/backfill', async (req, res) => {
  try {
    const tokenRecord = await prisma.freelancerToken.findUnique({ where: { userId: req.userId } })
    if (!tokenRecord) return res.status(400).json({ error: 'No Freelancer token found. Connect your Freelancer account first.' })
    if (isExpired(tokenRecord.expiresAt)) return res.status(400).json({ error: 'Freelancer token expired. Please reconnect.' })

    const flClient = createFreelancerClient(decrypt(tokenRecord.accessToken))

    // ── Phase 1: Clients from converted bids ─────────────────────────────
    let clientsCreated = 0
    let clientsUpdated = 0

    const convertedBids = await prisma.bid.findMany({
      where: { userId: req.userId, status: 'converted' },
      include: { project: { select: { id: true, freelancerProjectId: true, ownerId: true } } },
      orderBy: { placedAt: 'desc' },
    })

    if (convertedBids.length > 0) {
      // One entry per unique Freelancer project ID
      const seen = new Map()
      for (const bid of convertedBids) {
        const pid = bid.project?.freelancerProjectId
        if (pid && !seen.has(pid)) seen.set(pid, bid)
      }

      // Pass 1: fetch owner info from Freelancer API, accumulate per-owner totals
      // Using a Map makes this idempotent — re-running sets exact values, not increments
      const ownerData = new Map() // ownerId → { displayName, username, country, totalValue, projectCount, lastProjectAt }

      for (const [freelancerProjectId, bid] of seen) {
        try {
          const response = await flClient.get('/projects/0.1/projects/', {
            params: { 'projects[]': freelancerProjectId, user_details: true, owner_info: true },
          })
          const projectsMap = response.data?.result?.projects || {}
          const projectData = projectsMap[String(freelancerProjectId)]
          if (!projectData) continue

          const ownerId = projectData.owner_id
          if (!ownerId) continue

          const usersMap = response.data?.result?.users || {}
          const ownerUser = usersMap[String(ownerId)]
          const displayName = ownerUser?.display_name || ownerUser?.public_name || null
          const username = ownerUser?.username || null
          const country = ownerUser?.location?.country?.code || null

          if (!bid.project.ownerId) {
            await prisma.project.update({ where: { id: bid.project.id }, data: { ownerId } }).catch(() => {})
          }

          const bidAmount = bid.amount || 0
          const bidDate = bid.placedAt || bid.createdAt || null

          if (ownerData.has(ownerId)) {
            const d = ownerData.get(ownerId)
            d.totalValue += bidAmount
            d.projectCount += 1
            if (bidDate && (!d.lastProjectAt || bidDate > d.lastProjectAt)) d.lastProjectAt = bidDate
            if (!d.displayName && displayName) d.displayName = displayName
            if (!d.username && username) d.username = username
            if (!d.country && country) d.country = country
          } else {
            ownerData.set(ownerId, { displayName, username, country, totalValue: bidAmount, projectCount: 1, lastProjectAt: bidDate })
          }

          await new Promise(r => setTimeout(r, 300))
        } catch (err) {
          logger.warn(`Backfill: failed for project ${freelancerProjectId}: ${err.message}`)
        }
      }

      // Pass 2: upsert each client with exact computed totals
      for (const [ownerId, data] of ownerData) {
        try {
          const existing = await prisma.client.findUnique({
            where: { userId_freelancerUserId: { userId: req.userId, freelancerUserId: ownerId } },
          })
          if (existing) {
            await prisma.client.update({
              where: { id: existing.id },
              data: {
                ...(data.displayName && { displayName: data.displayName }),
                ...(data.username && { username: data.username }),
                ...(data.country && { country: data.country }),
                totalValue: data.totalValue,
                projectCount: data.projectCount,
                ...(data.lastProjectAt && { lastProjectAt: data.lastProjectAt }),
              },
            })
            clientsUpdated++
          } else {
            await prisma.client.create({
              data: {
                userId: req.userId,
                freelancerUserId: ownerId,
                displayName: data.displayName,
                username: data.username,
                country: data.country,
                totalValue: data.totalValue,
                projectCount: data.projectCount,
                lastProjectAt: data.lastProjectAt,
              },
            })
            clientsCreated++
          }
        } catch (err) {
          logger.warn(`Backfill: failed to upsert client ${ownerId}: ${err.message}`)
        }
      }
    }

    // ── Phase 2: Message threads (last 90 days) ───────────────────────────
    let threadsUpserted = 0
    try {
      const myUidStr = String(tokenRecord.freelancerUid || '')
      const ninetyDaysAgo = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000)
      const { threads } = await getThreadsSince(flClient, ninetyDaysAgo, 100)

      for (const thread of threads) {
        const context = thread.thread?.context
        if (!context || (context.type !== 'project' && context.type !== 'contest')) continue

        const messages = thread.messages || []
        let lastFromClient = null
        let lastFromMe = null
        let lastText = null
        let clientFlId = null

        for (const m of messages) {
          const isFromMe = myUidStr ? String(m.from_user) === myUidStr : false
          const ts = new Date(m.time_created * 1000)
          if (isFromMe) {
            if (!lastFromMe || ts > lastFromMe) lastFromMe = ts
          } else {
            if (!lastFromClient || ts > lastFromClient) {
              lastFromClient = ts
              lastText = m.message || null
            }
            if (!clientFlId) clientFlId = Number(m.from_user)
          }
        }

        let localProjectId = null
        if (context.type === 'project' && context.id) {
          const localProject = await prisma.project.findUnique({
            where: { freelancerProjectId: context.id },
            select: { id: true },
          }).catch(() => null)
          localProjectId = localProject?.id || null
        }

        await prisma.messageThread.upsert({
          where: { userId_freelancerThreadId: { userId: req.userId, freelancerThreadId: thread.id } },
          update: {
            ...(lastFromClient !== null && { lastMessageFromClientAt: lastFromClient }),
            ...(lastFromMe !== null && { lastMessageFromMeAt: lastFromMe }),
            ...(lastText !== null && { lastMessageText: lastText }),
          },
          create: {
            userId: req.userId,
            freelancerThreadId: thread.id,
            projectId: localProjectId,
            clientFreelancerId: clientFlId,
            lastMessageFromClientAt: lastFromClient,
            lastMessageFromMeAt: lastFromMe,
            lastMessageText: lastText,
          },
        }).catch(e => logger.warn(`Backfill: failed to upsert thread ${thread.id}: ${e.message}`))
        threadsUpserted++
      }
    } catch (err) {
      logger.warn(`Backfill: thread sync failed: ${err.message}`)
    }

    const message = `Clients: ${clientsCreated} new, ${clientsUpdated} updated. Threads: ${threadsUpserted} synced.`
    res.json({ created: clientsCreated, updated: clientsUpdated, threadsUpserted, total: clientsCreated + clientsUpdated, message })
  } catch (err) {
    logger.error({ err, msg: 'Backfill failed' })
    res.status(500).json({ error: 'Backfill failed: ' + err.message })
  }
})

// PATCH /api/clients/:id/notes — update CRM notes
router.patch('/:id/notes', async (req, res) => {
  const { notes } = req.body
  const id = parseInt(req.params.id)

  if (isNaN(id)) return res.status(400).json({ error: 'Invalid client ID' })
  if (notes !== undefined && typeof notes !== 'string') return res.status(400).json({ error: 'Notes must be a string' })
  if (notes && notes.length > 10000) return res.status(400).json({ error: 'Notes too long (max 10,000 characters)' })

  try {
    const client = await prisma.client.findFirst({
      where: { id, userId: req.userId },
    })
    if (!client) return res.status(404).json({ error: 'Client not found' })

    const updated = await prisma.client.update({
      where: { id },
      data: { notes },
    })
    res.json({ client: updated })
  } catch (err) {
    logger.error({ err, msg: 'Failed to update client notes' })
    res.status(500).json({ error: 'Failed to update notes' })
  }
})

module.exports = router
