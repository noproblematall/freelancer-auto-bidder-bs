// Prices and schedules a bid for one project from the profile's per-kind
// bidding parameters. Every profile bids on both fixed-price and hourly
// projects; which block of settings applies is decided by the project itself.
//
//   Fixed-price   fixedBidStrategy    ai | percentage            → total price
//                 fixedPeriodStrategy ai | fixed                 → delivery days (fixed = fallback days)
//   Hourly        hourlyRateStrategy  my_rate | ai               → rate per hour
//                 hourlyPeriodStrategy ai | fixed                → delivery days (fixed = fallback days)
//
// `profile.hourlyRate` (USD/hr), `profile.aiBidPercentage` (share of the AI's
// suggested fixed-price amount to bid) and the delivery bounds `profile.periodMinDays`,
// `profile.periodMaxDays` and `profile.periodFallbackDays` are account-wide
// settings folded onto the profile by applyAccountSettings. Profile amounts are in USD;
// projects bid in their own currency, so USD figures are converted first.
// AI suggestions and the client's budget are already in the project currency.
const { convertFromUSD, roundHourlyRate } = require('../currency');
const logger = require('../../utils/logger');

const FIXED_BID_STRATEGIES = ['ai', 'percentage'];
const HOURLY_RATE_STRATEGIES = ['my_rate', 'ai'];
const PERIOD_STRATEGIES = ['ai', 'fixed'];

const round2 = (n) => Math.round(n * 100) / 100;
const positive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

function projectKind(project) {
  return project.projectType === 'hourly' ? 'hourly' : 'fixed';
}

// USD → project currency; hourly rates snap to the nearest 5 after conversion
// so a GBP project doesn't get an awkward 38.72/hr.
async function usdToProject(usd, currency, { hourly = false } = {}) {
  const conv = await convertFromUSD(usd, currency);
  const amount = hourly && conv.converted ? roundHourlyRate(conv.amount) : conv.amount;
  return { amount, note: conv.converted ? ` (from $${usd} USD at ${conv.rate})` : '' };
}

function clampToBudget(amount, project) {
  let out = amount;
  if (positive(project.budgetMin) && out < project.budgetMin) out = project.budgetMin;
  if (positive(project.budgetMax) && out > project.budgetMax) out = project.budgetMax;
  return out;
}

// Total price for a fixed-price project, always kept inside the client's range.
async function fixedPrice(project, profile, analysis) {
  const currency = project.currency || 'USD';
  const strategy = FIXED_BID_STRATEGIES.includes(profile.fixedBidStrategy) ? profile.fixedBidStrategy : 'ai';
  let amount;
  let how;

  if (strategy === 'percentage' && positive(profile.bidPercentage) && positive(project.budgetMax)) {
    amount = round2(project.budgetMax * (profile.bidPercentage / 100));
    how = `${profile.bidPercentage}% of max budget ${project.budgetMax}`;
  } else {
    // AI-suggested (also the fallback when a percentage can't be applied
    // because the client listed no maximum). The account's aiBidPercentage
    // scales the AI-derived amount (e.g. 80 → bid 80% of the suggestion).
    const aiPct = positive(profile.aiBidPercentage) ? profile.aiBidPercentage : 100;
    const scale = (n) => (aiPct === 100 ? round2(n) : round2(n * (aiPct / 100)));
    const scaleNote = aiPct === 100 ? '' : ` × ${aiPct}%`;
    if (positive(analysis?.suggested_bid_amount)) {
      amount = scale(analysis.suggested_bid_amount);
      how = `AI suggestion ${round2(analysis.suggested_bid_amount)}${scaleNote}`;
    } else if (positive(analysis?.estimated_hours) && positive(profile.hourlyRate)) {
      const conv = await usdToProject(profile.hourlyRate, currency);
      amount = scale(analysis.estimated_hours * conv.amount);
      how = `${analysis.estimated_hours}h × hourly rate${conv.note}${scaleNote}`;
    } else if (positive(project.budgetMin)) {
      amount = project.budgetMin;
      how = 'client minimum';
    } else {
      amount = (await usdToProject(50, currency)).amount;
      how = 'floor';
    }
  }

  const clamped = clampToBudget(amount, project);
  if (clamped !== amount) how += `, clamped to ${project.budgetMin ?? '?'}-${project.budgetMax ?? '?'}`;
  return { amount: clamped, how };
}

// Rate per hour for an hourly project. "my_rate" bids the account rate as-is
// (the job filters already decide which ranges are worth bidding on);
// "ai" keeps the suggestion inside the client's listed range.
async function hourlyRate(project, profile, analysis) {
  const currency = project.currency || 'USD';
  const strategy = HOURLY_RATE_STRATEGIES.includes(profile.hourlyRateStrategy) ? profile.hourlyRateStrategy : 'my_rate';

  if (strategy === 'my_rate' && positive(profile.hourlyRate)) {
    const conv = await usdToProject(profile.hourlyRate, currency, { hourly: true });
    return { amount: conv.amount, how: `my rate${conv.note}` };
  }

  // AI-suggested, or "my_rate" with no account rate set yet
  let amount;
  let how;
  if (positive(analysis?.suggested_bid_amount)) {
    amount = round2(analysis.suggested_bid_amount);
    how = 'AI suggestion';
  } else if (positive(profile.hourlyRate)) {
    const conv = await usdToProject(profile.hourlyRate, currency, { hourly: true });
    amount = conv.amount;
    how = `my rate${conv.note}`;
  } else if (positive(project.budgetMax)) {
    amount = project.budgetMax;
    how = 'client maximum';
  } else {
    amount = (await usdToProject(15, currency, { hourly: true })).amount;
    how = 'floor';
  }
  const clamped = clampToBudget(amount, project);
  if (clamped !== amount) how += `, clamped to ${project.budgetMin ?? '?'}-${project.budgetMax ?? '?'}/hr`;
  return { amount: clamped, how };
}

// Delivery period in days for either kind. "fixed" always promises the
// account's fallback days; "ai" estimates and clamps to the account's
// min/max days, using the fallback when nothing can be estimated.
//   fixed:  blends budget ÷ (8h × hourly rate) at 90% with the AI estimate at 10%
//   hourly: there is no total budget to derive days from, so the AI estimate is used
async function deliveryPeriod(project, profile, analysis, kind) {
  const raw = kind === 'hourly' ? profile.hourlyPeriodStrategy : profile.fixedPeriodStrategy;
  const strategy = PERIOD_STRATEGIES.includes(raw) ? raw : 'ai';
  const fallback = positive(profile.periodFallbackDays) ? Math.round(profile.periodFallbackDays) : 7;

  if (strategy === 'fixed') return { days: fallback, how: 'fixed (fallback days)' };

  const bounds = { min: profile.periodMinDays, max: profile.periodMaxDays };

  const aiDays = positive(analysis?.suggested_timeline_days) ? Math.round(analysis.suggested_timeline_days) : 0;
  let formulaDays = 0;
  if (kind === 'fixed') {
    const budget = positive(project.budgetMax) ? project.budgetMax : project.budgetMin;
    if (positive(budget) && positive(profile.hourlyRate)) {
      // Budget is in the project currency, the rate in USD: convert so the
      // estimate isn't skewed on non-USD projects.
      const localRate = (await usdToProject(profile.hourlyRate, project.currency || 'USD')).amount;
      formulaDays = budget / (8 * localRate);
    }
  }

  let days;
  let how;
  if (formulaDays > 0 && aiDays > 0) {
    days = Math.round(formulaDays * 0.9 + aiDays * 0.1);
    how = `formula ${formulaDays.toFixed(1)}d × 90% + AI ${aiDays}d × 10%`;
  } else if (formulaDays > 0) {
    days = Math.round(formulaDays);
    how = `formula ${formulaDays.toFixed(1)}d`;
  } else if (aiDays > 0) {
    days = aiDays;
    how = `AI ${aiDays}d`;
  } else {
    days = fallback;
    how = 'fallback';
  }

  if (positive(bounds.min) && days < bounds.min) { days = Math.round(bounds.min); how += `, raised to min ${days}`; }
  if (positive(bounds.max) && days > bounds.max) { days = Math.round(bounds.max); how += `, capped at max ${days}`; }
  if (days < 1) days = 1;
  return { days, how };
}

// → { kind, amount, periodDays }
async function priceBid(project, profile, analysis) {
  const kind = projectKind(project);
  const price = kind === 'hourly'
    ? await hourlyRate(project, profile, analysis)
    : await fixedPrice(project, profile, analysis);
  const period = await deliveryPeriod(project, profile, analysis, kind);

  const unit = kind === 'hourly' ? `${project.currency || 'USD'}/hr` : (project.currency || 'USD');
  logger.info(`Project #${project.id} (${kind}): bid ${price.amount} ${unit} [${price.how}], ${period.days}d [${period.how}]`);

  return { kind, amount: price.amount, periodDays: period.days };
}

module.exports = {
  FIXED_BID_STRATEGIES,
  HOURLY_RATE_STRATEGIES,
  PERIOD_STRATEGIES,
  projectKind,
  fixedPrice,
  hourlyRate,
  deliveryPeriod,
  priceBid,
};
