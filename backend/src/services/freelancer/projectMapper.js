// Turns a project from Freelancer's search/detail responses into the row the
// `projects` table stores. Shared by the bidding engine and the Projects page
// search so both see the same facts, including the employer facts behind the
// client score (services/bidding/clientScore.js).
const { scoreClient, serializeReasons } = require('../bidding/clientScore');

// Country: owner_info.country (per Freelancer support) > project location >
// true_location > the users map. currency.country is NOT used — it returns
// zone codes like "EU" for the Euro, not real country codes.
function resolveCountry(p, ownerUser) {
  const raw = p.owner_info?.country?.code
    || p.location?.country?.code
    || p.true_location?.country?.code
    || ownerUser?.location?.country?.code
    || null;
  return raw ? String(raw).toUpperCase() : null;
}

function countrySource(p, ownerUser) {
  return p.owner_info?.country?.code ? 'owner_info.country'
    : p.location?.country?.code ? 'project.location'
    : p.true_location?.country?.code ? 'project.true_location'
    : ownerUser?.location?.country?.code ? 'users[owner].location'
    : 'none';
}

// Employer facts. Freelancer now hides `owner_id` in project searches (it is
// null and the `users` map comes back empty), so the facts come from the
// project's own `owner_info` (status, employer reputation, registration date);
// the `users` map is only a fallback for responses that still carry it.
function ownerFacts(p, ownerUser) {
  const info = p.owner_info || {};
  const st = info.status || ownerUser?.status || {};
  const rep = info.reputation?.entire_history || ownerUser?.employer_reputation?.entire_history || {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const bool = (v) => (typeof v === 'boolean' ? v : null);
  const registered = num(info.registration_date) ?? num(ownerUser?.registration_date);
  return {
    paymentVerified: bool(st.payment_verified),
    depositMade: bool(st.deposit_made),
    reviews: num(rep.reviews),
    rating: num(rep.overall),
    projectsComplete: num(rep.complete),
    projectsAll: num(rep.all),
    registeredAt: registered ? new Date(registered * 1000) : null,
  };
}

function projectDataFromApi(p, users = {}) {
  const ownerUser = p.owner_id ? users[String(p.owner_id)] : null;
  const ownerCountry = resolveCountry(p, ownerUser);
  const ownerLocationObj = p.owner_info?.country
    ? { country: p.owner_info.country, city: p.owner_info.city || null }
    : p.location || p.true_location || null;
  const owner = ownerFacts(p, ownerUser);
  const bidCount = p.bid_stats?.bid_count ?? 0;
  const bidAvg = typeof p.bid_stats?.bid_avg === 'number' ? p.bid_stats.bid_avg : null;
  const { score, reasons } = scoreClient({ owner, project: { bidCount, hireme: !!p.hireme } });

  return {
    freelancerProjectId: p.id,
    title: p.title || 'Untitled',
    description: p.preview_description || p.description || null,
    budgetMin: p.budget?.minimum ?? null,
    budgetMax: p.budget?.maximum ?? null,
    currency: p.currency?.code || 'USD',
    language: p.language ? String(p.language).toLowerCase() : null,
    jobIds: p.jobs ? JSON.stringify(p.jobs.map(j => ({ id: j.id, name: j.name }))) : null,
    ownerId: p.owner_id ?? null,
    ownerCountry,
    ownerLocation: ownerLocationObj ? JSON.stringify(ownerLocationObj) : null,
    bidCount,
    bidAvg,
    timeSubmitted: p.time_submitted ? new Date(p.time_submitted * 1000) : null,
    status: p.status || 'active',
    projectType: p.type || null,
    lastCheckedAt: new Date(),
    ownerName: ownerUser?.display_name || ownerUser?.public_name || null,
    ownerUsername: ownerUser?.username || null,
    ownerPaymentVerified: owner.paymentVerified,
    ownerDepositMade: owner.depositMade,
    ownerReviews: owner.reviews,
    ownerRating: owner.rating,
    ownerProjectsComplete: owner.projectsComplete,
    ownerProjectsAll: owner.projectsAll,
    ownerRegisteredAt: owner.registeredAt,
    clientScore: score,
    clientScoreReasons: serializeReasons(reasons),
    _countrySource: countrySource(p, ownerUser),
  };
}

// Strip the helper-only fields before handing the data to Prisma.
function forPrisma(data) {
  const { _countrySource, ...rest } = data;
  return rest;
}

module.exports = { projectDataFromApi, forPrisma, ownerFacts, resolveCountry };
