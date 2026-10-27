const logger = require('../../utils/logger');

async function placeBid(client, { projectId, bidderId, amount, period, milestonePercentage, description, sealed }) {
  try {
    const body = {
      project_id: projectId,
      bidder_id: bidderId,
      amount,
      period,
      milestone_percentage: milestonePercentage,
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

module.exports = { placeBid, getBids, retractBid, sealBid, getBidById };
