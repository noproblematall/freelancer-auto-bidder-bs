// Employer quality score (0–100) from the facts Freelancer returns with a
// project search: whether the client can pay, whether they have hired before
// and how that went, how old the account is and how crowded the project
// already is. On Freelancer these predict a reply better than anything in the
// project text, so the engine skips projects under Settings → Auto-Bidding →
// Minimum client score before spending an OpenAI call on them.
//
// Deterministic on purpose: the same facts always give the same score, and
// every point is explained in `reasons` so the Projects page can show why.

const NEW_ACCOUNT_DAYS = 30;

function scoreClient({ owner = {}, project = {} } = {}) {
  let score = 50;
  const reasons = [];
  const add = (points, why) => { score += points; reasons.push(`${points > 0 ? '+' : ''}${points} ${why}`); };

  const known = (v) => v !== null && v !== undefined;

  // Can the client pay?
  if (owner.paymentVerified === true) add(20, 'payment verified');
  else if (owner.paymentVerified === false) add(-15, 'payment not verified');
  if (owner.depositMade === true) add(5, 'has made a deposit');

  // Have they hired before, and did it go well?
  const reviews = known(owner.reviews) ? owner.reviews : null;
  const all = known(owner.projectsAll) ? owner.projectsAll : null;
  const complete = known(owner.projectsComplete) ? owner.projectsComplete : null;
  if (reviews !== null) {
    if (reviews >= 10) add(12, `${reviews} reviews from freelancers`);
    else if (reviews >= 1) add(8, `${reviews} review${reviews === 1 ? '' : 's'} from freelancers`);
    else add(-5, 'no reviews yet');
  }
  if (known(owner.rating) && reviews) {
    if (owner.rating >= 4.5) add(8, `rated ${owner.rating.toFixed(1)}/5 by freelancers`);
    else if (owner.rating < 3.5) add(-10, `rated only ${owner.rating.toFixed(1)}/5 by freelancers`);
  }
  if (all !== null && complete !== null && all >= 3) {
    const ratio = complete / all;
    if (ratio >= 0.5) add(10, `${complete} of ${all} posted projects completed`);
    else if (ratio < 0.2) add(-10, `only ${complete} of ${all} posted projects completed`);
  }

  // Brand-new account with nothing behind it
  if (owner.registeredAt instanceof Date && !Number.isNaN(owner.registeredAt.getTime())) {
    const ageDays = (Date.now() - owner.registeredAt.getTime()) / 86400000;
    if (ageDays < NEW_ACCOUNT_DAYS && !reviews) add(-8, 'account under a month old');
    else if (ageDays > 365 * 2) add(3, 'account over two years old');
  }

  // How crowded the project already is
  const bids = known(project.bidCount) ? project.bidCount : null;
  if (bids !== null) {
    if (bids >= 40) add(-15, `${bids} bids already on the project`);
    else if (bids >= 25) add(-8, `${bids} bids already on the project`);
    else if (bids < 10) add(5, `only ${bids} bids so far`);
  }

  // Direct-hire listings (hireme) are addressed to someone else
  if (project.hireme === true) add(-25, 'direct-hire project aimed at a chosen freelancer');

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, reasons };
}

// Reasons as stored on the project (one line each).
function serializeReasons(reasons) {
  return Array.isArray(reasons) && reasons.length ? reasons.join('\n') : null;
}

module.exports = { scoreClient, serializeReasons };
