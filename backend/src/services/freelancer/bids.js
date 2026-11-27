const logger = require('../../utils/logger');

// Freelancer requires milestone_percentage on every bid. The website's own
// bid form never asks for it and sends 100, so we do the same.
const MILESTONE_PERCENTAGE = 100;

async function placeBid(client, { projectId, bidderId, amount, period, description, sealed }) {
  try {
    const body = {
      project_id: projectId,
      bidder_id: bidderId,
      amount,
      period,
      milestone_percentage: MILESTONE_PERCENTAGE,
      description,
    };
    // `sealed` is not in the official POST docs, but the bid object exposes a
    // `sealed` field — we send it speculatively and rely on the returned
    // value to know whether Freelancer honored it.
    if (sealed) body.sealed = true;

    const response = await client.post('/projects/0.1/bids/', body);
    logger.info(`Bid placed on project ${projectId}: $${amount}${sealed ? ' (requested sealed)' : ''}`);
    return response.data.result;
  } catch (err) {
    const apiError = err.response?.data;
    logger.error(`Freelancer bid API error: ${JSON.stringify(apiError)}`);
    const message = apiError?.message || apiError?.status || err.message;
    throw new Error(message);
  }
}

async function getBids(client, { projectIds, bidIds, limit, offset } = {}) {
  const params = { limit: limit || 20, offset: offset || 0 };
  if (projectIds && projectIds.length) params['project_ids[]'] = projectIds;
  if (bidIds && bidIds.length) params['bid_ids[]'] = bidIds;

  const response = await client.get('/projects/0.1/bids', { params });
  logger.info(`Fetched bids: ${response.data.result.bids?.length || 0} results`);
  return response.data.result;
}

// The account's own bids on a batch of projects, with their award_status
// (pending | awarded | rejected | revoked | canceled), retracted flag and
// frontend_bid_status. outcomeSync uses this to record wins and losses.
async function getMyBidsForProjects(client, { bidderId, projectIds }) {
  const ids = (projectIds || []).filter(Boolean);
  if (!ids.length) return [];
  const response = await client.get('/projects/0.1/bids/', {
    params: { 'bidders[]': [bidderId], 'projects[]': ids, limit: Math.max(ids.length, 20) },
  });
  return response.data?.result?.bids || [];
}

// Every bid on a project with the bidders' details (reputation, country,
// hourly rate), for the winning-bid study and the client explorer. Bid text is
// public on Freelancer unless the bid was sealed.
async function getProjectBids(client, projectId, { limit = 200 } = {}) {
  const response = await client.get('/projects/0.1/bids/', {
    params: {
      'projects[]': [projectId], limit,
      user_details: true, user_reputation: true, user_country_details: true, user_status: true, user_display_info: true,
    },
  });
  const result = response.data?.result || {};
  return { bids: result.bids || [], users: result.users || {} };
}

// Only the awarded bid(s) on up to ~20 projects in one request, with the
// winners' details. Filtering on Freelancer's side finds the winner even on
// projects with hundreds of bids, where it is often past the first 200.
async function getAwardedBids(client, projectIds) {
  const ids = (projectIds || []).filter(Boolean);
  if (!ids.length) return { bids: [], users: {} };
  const response = await client.get('/projects/0.1/bids/', {
    params: {
      'projects[]': ids, 'award_statuses[]': ['awarded'], limit: Math.max(50, ids.length * 3),
      user_details: true, user_reputation: true, user_country_details: true, user_status: true, user_display_info: true,
    },
  });
  const result = response.data?.result || {};
  return { bids: result.bids || [], users: result.users || {} };
}

// The account's own bids on Freelancer, newest first, back to `sinceSec`
// (unix seconds). Includes bids placed outside this app.
async function getAccountBids(client, bidderId, { sinceSec = 0, max = 10000 } = {}) {
  const out = [];
  for (let offset = 0; offset < max; offset += 100) {
    const response = await client.get('/projects/0.1/bids/', { params: { 'bidders[]': [bidderId], limit: 100, offset } });
    const page = response.data?.result?.bids || [];
    for (const b of page) if (!b.retracted && (b.time_submitted || 0) >= sinceSec) out.push(b);
    if (page.length < 100 || page.every((b) => (b.time_submitted || 0) < sinceSec)) break;
  }
  return out;
}

// Attempt to seal a previously-placed bid via PUT ?action=seal (mirrors the
// documented `action=highlight` / `action=sponsor` upgrade pattern). The
// action isn't in the documented enum, so callers must verify by re-reading
// the bid afterwards.
async function sealBid(client, freelancerBidId) {
  try {
    const response = await client.put(
      `/projects/0.1/bids/${freelancerBidId}/`,
      null,
      {
        params: { action: 'seal' },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );
    logger.info(`Bid ${freelancerBidId} seal request sent (status ${response.status})`);
    return { ok: true, status: response.status, data: response.data };
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    logger.warn(`Bid ${freelancerBidId} seal request failed: HTTP ${status ?? 'NETWORK'} — ${JSON.stringify(body || err.message)}`);
    return { ok: false, status, data: body };
  }
}

// Fetch a single bid by its Freelancer bid id (used to verify sealing took)
async function getBidById(client, freelancerBidId) {
  const response = await client.get('/projects/0.1/bids/', {
    params: { 'bids[]': freelancerBidId, limit: 1 },
  });
  const bids = response.data?.result?.bids || [];
  return bids[0] || null;
}

async function retractBid(client, freelancerBidId) {
  const response = await client.put(
    `/projects/0.1/bids/${freelancerBidId}`,
    null,
    {
      params: { action: 'retract' },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );
  logger.info(`Bid ${freelancerBidId} retracted`);
  return response.data;
}

module.exports = { MILESTONE_PERCENTAGE, placeBid, getBids, getMyBidsForProjects, getProjectBids, getAwardedBids, getAccountBids, retractBid, sealBid, getBidById };
