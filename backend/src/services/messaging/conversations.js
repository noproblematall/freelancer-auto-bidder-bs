// Messages page: conversations where a client wrote to us, and for one of them
// everything needed to answer well — the whole conversation, who the client
// is, the project, our bid.
// Read live from Freelancer (short cache), falling back to the local database
// for a project Freelancer no longer returns (deleted listings).
const prisma = require('../../config/database');
const { createFreelancerClient } = require('../freelancer/client');
const { getMessagesForThreads } = require('../freelancer/messages');
const { decrypt, isExpired } = require('../../utils/tokenManager');
const logger = require('../../utils/logger');

const LIST_LIMIT = 100;
const CACHE_MS = 60 * 1000;
const cache = new Map();
const cached = async (key, fn) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
};
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const date = (sec) => (num(sec) ? new Date(sec * 1000) : null);

async function flClientFor(userId) {
  const token = await prisma.freelancerToken.findUnique({ where: { userId } });
  if (!token || isExpired(token.expiresAt)) { const e = new Error('Freelancer is not connected. Connect it in Settings.'); e.status = 400; throw e; }
  return { client: createFreelancerClient(decrypt(token.accessToken)), myUid: Number(token.freelancerUid) || null };
}

function userCard(u, id) {
  if (!u) return { id, name: null, username: null, country: null, countryName: null, city: null, avatar: null };
  const avatar = u.avatar_cdn || u.avatar_large_cdn || u.avatar || null;
  return {
    id: u.id || id,
    name: u.display_name || u.public_name || u.username || null,
    username: u.username || null,
    // Freelancer often sends the country name without its code here.
    country: u.location?.country?.code ? String(u.location.country.code).toUpperCase() : null,
    countryName: u.location?.country?.name || null,
    city: u.location?.city || null,
    avatar: avatar ? (String(avatar).startsWith('//') ? `https:${avatar}` : avatar) : null,
    url: u.username ? `https://www.freelancer.com/u/${u.username}` : null,
  };
}

// ── List ─────────────────────────────────────────────────────────────────────

async function listConversations(userId) {
  const { client, myUid } = await flClientFor(userId);
  return cached(`list:${userId}`, async () => {
    const r = await client.get('/messages/0.1/threads/', { params: { limit: LIST_LIMIT, user_details: true } });
    const threads = (r.data?.result?.threads || []).filter((t) => t.thread?.context?.type === 'project');
    const users = r.data?.result?.users || {};
    const ids = threads.map((t) => t.thread.id);
    const messages = [];
    for (let i = 0; i < ids.length; i += 10) messages.push(...await getMessagesForThreads(client, ids.slice(i, i + 10), 500));
    const byThread = new Map();
    for (const m of messages) { if (!byThread.has(m.thread_id)) byThread.set(m.thread_id, []); byThread.get(m.thread_id).push(m); }

    // Project titles: local database first, Freelancer for the rest.
    const projectIds = [...new Set(threads.map((t) => t.thread.context.id))];
    const local = await prisma.project.findMany({ where: { freelancerProjectId: { in: projectIds } }, select: { id: true, freelancerProjectId: true, title: true } });
    const titles = new Map(local.map((p) => [p.freelancerProjectId, p]));
    const missing = projectIds.filter((id) => !titles.has(id));
    for (let i = 0; i < missing.length; i += 50) {
      try {
        const pr = await client.get('/projects/0.1/projects/', { params: { 'projects[]': missing.slice(i, i + 50), limit: 50 } });
        for (const p of pr.data?.result?.projects || []) titles.set(p.id, { id: null, freelancerProjectId: p.id, title: p.title });
      } catch (err) { logger.warn(`conversations: project titles not read: ${err.message}`); }
    }

    const rows = [];
    for (const t of threads) {
      const msgs = byThread.get(t.thread.id) || [];
      const fromClient = msgs.filter((m) => Number(m.from_user) !== myUid);
      if (!fromClient.length) continue; // only conversations where the client wrote
      const clientId = Number(fromClient[0].from_user) || (t.thread.members || []).find((m) => Number(m) !== myUid) || null;
      const last = msgs[msgs.length - 1];
      const lastFromClient = fromClient[fromClient.length - 1];
      const project = titles.get(t.thread.context.id);
      rows.push({
        threadId: t.thread.id,
        projectId: t.thread.context.id,
        localProjectId: project?.id || null,
        projectTitle: project?.title || `Project #${t.thread.context.id}`,
        client: userCard(users[clientId], clientId),
        lastMessage: last ? { text: last.message || '', fromClient: Number(last.from_user) !== myUid, at: date(last.time_created) } : null,
        lastClientMessageAt: date(lastFromClient.time_created),
        clientMessages: fromClient.length,
        messages: msgs.length,
        unread: num(t.message_unread_count) || 0,
        waitingOnYou: !!last && Number(last.from_user) !== myUid,
      });
    }
    rows.sort((a, b) => (b.lastMessage?.at?.getTime?.() || 0) - (a.lastMessage?.at?.getTime?.() || 0));
    return { conversations: rows, total: rows.length };
  });
}

// ── One conversation ─────────────────────────────────────────────────────────

function projectFacts(p) {
  const hourly = p.type === 'hourly';
  const info = p.hourly_project_info || {};
  return {
    freelancerProjectId: p.id,
    title: p.title,
    description: p.description || p.preview_description || '',
    url: p.seo_url ? `https://www.freelancer.com/projects/${p.seo_url}` : `https://www.freelancer.com/projects/${p.id}`,
    type: p.type || null,
    currency: p.currency?.code || 'USD',
    currencySign: p.currency?.sign || null,
    budgetMin: num(p.budget?.minimum),
    budgetMax: num(p.budget?.maximum),
    hourly: hourly ? { hoursPerWeek: num(info.commitment?.hours), interval: info.commitment?.interval || null, duration: info.duration_enum || null } : null,
    status: p.status || null,
    frontendStatus: p.frontend_project_status || null,
    bidCount: num(p.bid_stats?.bid_count),
    bidAvg: num(p.bid_stats?.bid_avg),
    postedAt: date(p.time_submitted),
    bidPeriodDays: num(p.bidperiod),
    skills: Array.isArray(p.jobs) ? p.jobs.map((j) => j.name).filter(Boolean) : [],
    country: p.owner_info?.country?.code ? String(p.owner_info.country.code).toUpperCase() : null,
    upgrades: Object.entries(p.upgrades || {}).filter(([, v]) => v === true).map(([k]) => k),
  };
}

function localProjectFacts(p) {
  let skills = [];
  try { skills = JSON.parse(p.jobIds || '[]').map((j) => (typeof j === 'object' ? j.name : null)).filter(Boolean); } catch { /* ignore */ }
  return {
    freelancerProjectId: p.freelancerProjectId, title: p.title, description: p.description || '',
    url: `https://www.freelancer.com/projects/${p.freelancerProjectId}`, type: p.projectType, currency: p.currency, currencySign: null,
    budgetMin: p.budgetMin, budgetMax: p.budgetMax, hourly: null, status: p.status, frontendStatus: null,
    bidCount: p.bidCount, bidAvg: p.bidAvg, postedAt: p.timeSubmitted, bidPeriodDays: null, skills, country: p.ownerCountry, upgrades: [],
    fromLocalCopy: true,
  };
}

async function getConversation(userId, threadId) {
  const { client, myUid } = await flClientFor(userId);
  return cached(`thread:${userId}:${threadId}`, async () => {
    const tr = await client.get(`/messages/0.1/threads/?threads[]=${encodeURIComponent(threadId)}`, { params: { user_details: true } });
    const t = (tr.data?.result?.threads || [])[0];
    if (!t) { const e = new Error('Conversation not found on Freelancer.'); e.status = 404; throw e; }
    const users = tr.data?.result?.users || {};
    const messages = await getMessagesForThreads(client, [threadId], 500);
    const clientId = Number(messages.find((m) => Number(m.from_user) !== myUid)?.from_user)
      || Number((t.thread.members || []).find((m) => Number(m) !== myUid)) || null;
    const projectId = t.thread.context?.type === 'project' ? t.thread.context.id : null;

    // The client: Freelancer shows who they are once they write to us.
    let clientUser = users[clientId] || null;
    let employer = null;
    if (clientId) {
      try {
        const ur = await client.get('/users/0.1/users/', { params: { 'users[]': [clientId], employer_reputation: true, status: true, country_details: true, display_info: true, avatar: true, location_details: true } });
        const u = ur.data?.result?.users?.[clientId] || ur.data?.result?.[clientId];
        if (u) clientUser = { ...clientUser, ...u };
      } catch (err) { logger.warn(`conversations: client ${clientId} not read: ${err.message}`); }
    }
    if (clientUser) {
      const rep = clientUser.employer_reputation?.entire_history || {};
      employer = {
        ...userCard(clientUser, clientId),
        registeredAt: date(clientUser.registration_date),
        paymentVerified: clientUser.status?.payment_verified ?? null,
        depositMade: clientUser.status?.deposit_made ?? null,
        emailVerified: clientUser.status?.email_verified ?? null,
        phoneVerified: clientUser.status?.phone_verified ?? null,
        identityVerified: clientUser.status?.identity_verified ?? null,
        rating: num(rep.reviews) ? num(rep.overall) : null,
        reviews: num(rep.reviews),
        projectsPosted: num(rep.all),
        projectsCompleted: num(rep.complete),
        onBudget: num(rep.on_budget),
        onTime: num(rep.on_time),
        timezone: clientUser.timezone?.timezone || null,
      };
    } else if (clientId) {
      employer = { id: clientId, name: null, username: null };
    }

    // The project, live (full description); the local copy if Freelancer no longer has it.
    let project = null;
    let local = projectId ? await prisma.project.findUnique({ where: { freelancerProjectId: projectId } }) : null;
    if (projectId) {
      try {
        const pr = await client.get('/projects/0.1/projects/', { params: { 'projects[]': [projectId], full_description: true, job_details: true, owner_info: true, upgrade_details: true } });
        const p = (pr.data?.result?.projects || [])[0];
        if (p) project = projectFacts(p);
      } catch (err) { logger.warn(`conversations: project ${projectId} not read: ${err.message}`); }
      if (!project && local) project = localProjectFacts(local);
      if (project && !project.title && local) project.title = local.title;
    }

    // Our bid: as Freelancer has it; the app's copy adds the profile used.
    let bid = null;
    if (projectId && myUid) {
      try {
        const br = await client.get('/projects/0.1/bids/', { params: { 'projects[]': [projectId], 'bidders[]': [myUid] } });
        const b = (br.data?.result?.bids || []).sort((a, c) => (c.time_submitted || 0) - (a.time_submitted || 0))[0];
        if (b) {
          bid = {
            freelancerBidId: b.id, amount: num(b.amount), periodDays: num(b.period), text: b.description || '',
            placedAt: date(b.time_submitted), awardStatus: b.award_status || null, sealed: !!b.sealed, highlighted: !!b.highlighted,
            hourlyRate: project?.type === 'hourly' ? num(b.amount) : null, shortlisted: !!b.shortlisted, rank: num(b.bid_rank),
          };
        }
      } catch (err) { logger.warn(`conversations: our bid on ${projectId} not read: ${err.message}`); }
      const localBid = local ? await prisma.bid.findFirst({ where: { userId, projectId: local.id }, orderBy: { id: 'desc' }, include: { profile: { select: { name: true } } } }) : null;
      if (!bid && localBid) {
        bid = { freelancerBidId: localBid.freelancerBidId, amount: localBid.amount, periodDays: localBid.periodDays, text: localBid.proposalText, placedAt: localBid.placedAt, awardStatus: localBid.awardStatus, sealed: localBid.sealed, highlighted: false, hourlyRate: null, fromLocalCopy: true };
      }
      if (bid && localBid) { bid.profile = localBid.profile?.name || null; bid.localBidId = localBid.id; }
    }

    const conversation = messages.map((m) => ({
      id: m.id,
      fromClient: Number(m.from_user) !== myUid,
      text: m.message || '',
      at: date(m.time_created),
      attachments: (m.attachments || []).map((a) => a.filename || a.name).filter(Boolean),
    }));

    return {
      threadId: Number(threadId),
      threadUrl: `https://www.freelancer.com/messages/thread/${threadId}`,
      projectId,
      localProjectId: local?.id || null,
      client: employer,
      project,
      bid,
      conversation,
      waitingOnYou: conversation.length > 0 && conversation[conversation.length - 1].fromClient,
    };
  });
}

function clearCache(userId, threadId) {
  cache.delete(`list:${userId}`);
  if (threadId) cache.delete(`thread:${userId}:${threadId}`);
}

module.exports = { listConversations, getConversation, clearCache };
