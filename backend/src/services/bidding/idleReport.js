// Explains why nothing has been bid. When an account has not placed or queued
// a bid for IDLE_WINDOW_MS, the Bid History page asks for this report and shows
// the reasons: auto-bidding stopped, no profile switched on, outside the
// schedule, Freelancer or OpenAI problems, bid limits, or what the last runs
// did with the projects they found (none found, all filtered, none relevant,
// all skipped). It only reads; nothing is changed.
const prisma = require('../../config/database');
const { isExpired } = require('../../utils/tokenManager');
const { checkGlobalSchedule } = require('./scheduleChecker');
const scheduler = require('./scheduler');
const { getCachedBidQuota } = require('../freelancer/bidQuota');

const IDLE_WINDOW_MS = 2 * 60 * 60 * 1000;

// Statuses that mean the engine produced a bid (sent, or queued for review).
const BID_ACTIVITY_STATUSES = ['placed', 'converted', 'pending_review', 'pending'];

// Problem entries the engine writes (see engine.js / scheduler.js), newest first.
const PROBLEM_ACTIONS = {
  scheduler_auto_paused: 'Auto-bidding paused itself after a fatal Freelancer error',
  scheduler_run_failed: 'A bidding run failed',
  openai_stall_detected: 'OpenAI could not analyze projects',
  openai_not_configured: 'No OpenAI API key is set',
  token_refresh_failed: 'The Freelancer connection expired',
  freelancer_not_connected: 'Freelancer is not connected',
  project_search_failed: 'The project search failed',
  bid_cap_reached: 'A bid limit was reached',
  freelancer_bids_exhausted: 'Your Freelancer account has no bids left',
};

function parse(details) {
  try { return details ? JSON.parse(details) : {}; } catch { return {}; }
}

async function explainIdle(userId, { now = Date.now(), windowMs = IDLE_WINDOW_MS } = {}) {
  const since = new Date(now - windowMs);

  const lastBid = await prisma.bid.findFirst({
    where: { userId, status: { in: BID_ACTIVITY_STATUSES } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, status: true },
  });
  const lastBidAt = lastBid ? lastBid.createdAt : null;
  if (lastBidAt && lastBidAt.getTime() >= since.getTime()) {
    return { idle: false, lastBidAt, windowMinutes: windowMs / 60000, reasons: [], runs: null };
  }

  const reasons = [];
  const add = (kind, title, detail) => { if (!reasons.some(r => r.kind === kind)) reasons.push({ kind, title, detail }); };

  const [user, token, activeProfiles, pendingReview] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { openaiApiKey: true, reviewMode: true, maxBidsPerHour: true, maxBidsPerDay: true, scheduleEnabled: true },
    }),
    prisma.freelancerToken.findUnique({ where: { userId }, select: { expiresAt: true, refreshToken: true } }),
    prisma.biddingProfile.findMany({ where: { userId, isActive: true }, select: { name: true, minRelevanceScore: true } }),
    prisma.bid.count({ where: { userId, status: 'pending_review' } }),
  ]);

  // 1. Things that stop the engine before it looks at any project.
  const status = scheduler.getStatus();
  if (!status.running) add('stopped', 'Auto-bidding is switched off', 'Turn it on with the BidPilot switch under Settings → Auto-Bidding.');
  // Runs are skipped while one is still in progress; a run that never ends blocks everything.
  const runAgeMs = status.processing && status.currentRunStartedAt ? now - new Date(status.currentRunStartedAt).getTime() : 0;
  if (runAgeMs > 15 * 60 * 1000) add('stuck_run', 'A bidding run has been in progress for a long time', `Started ${Math.round(runAgeMs / 60000)} minutes ago and has not finished, so no new run can start. Restart the app.`);
  if (activeProfiles.length === 0) add('no_profile', 'No bid profile is switched on', 'Switch one on under Bid Profiles. Nothing is searched or bid without an active profile.');
  if (!token) add('freelancer', 'Freelancer is not connected', 'Connect your Freelancer account under Settings → Freelancer.com.');
  else if (isExpired(token.expiresAt) && !token.refreshToken) add('freelancer', 'The Freelancer connection has expired', 'Reconnect under Settings → Freelancer.com.');
  const quota = getCachedBidQuota(userId);
  if (quota && quota.remaining === 0) {
    const fmt = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const nextTry = quota.exhaustedUntil ? ` (next try at ${fmt(quota.exhaustedUntil)})` : '';
    if (quota.source === 'rejection') {
      add('freelancer_bids_exhausted', 'Freelancer rejected the last bid: no bids left',
        `${quota.lastRejectionAt ? `At ${fmt(quota.lastRejectionAt)} ` : ''}Freelancer said "${quota.lastRejection || 'no bids left'}". It does not report how many bids are left, so the account is assumed empty for a while; bids refill over time. Meanwhile the automatic runs do not search Freelancer or call OpenAI${nextTry}; the Projects page's "Search Freelancer" button still works. If your Freelancer dashboard shows bids left, click the bids pill in the header to try again now.`);
    } else {
      add('freelancer_bids_exhausted', 'Your Freelancer account has no bids left', `The membership allowance${quota.limit !== null ? ` of ${quota.limit}` : ''} is used up. Bids refill over time, or upgrade the membership on Freelancer.com. Meanwhile the automatic runs do not search Freelancer or call OpenAI${nextTry}; the Projects page's "Search Freelancer" button still works.`);
    }
  }
  if (!user?.openaiApiKey) add('openai', 'No OpenAI API key is set', 'Add your key under Settings → OpenAI. Projects cannot be scored or written without it.');

  const schedule = await checkGlobalSchedule();
  if (!schedule.allowed) add('sleeping', 'Sleeping: outside your bidding schedule', `${schedule.reason}. Change the hours under Settings → Schedule.`);

  // 2. Bid limits, counting drafts waiting for review as the engine does.
  const hourAgo = new Date(now - 60 * 60 * 1000);
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const [hourCount, dayCount] = await Promise.all([
    prisma.bid.count({ where: { userId, OR: [{ status: 'placed', placedAt: { gte: hourAgo } }, { status: 'pending_review', createdAt: { gte: hourAgo } }] } }),
    prisma.bid.count({ where: { userId, OR: [{ status: 'placed', placedAt: { gte: dayAgo } }, { status: 'pending_review', createdAt: { gte: dayAgo } }] } }),
  ]);
  if (user && hourCount >= user.maxBidsPerHour) add('cap', 'Hourly bid limit reached', `${hourCount} of ${user.maxBidsPerHour} this hour. Raise it under Settings → Auto-Bidding or wait.`);
  else if (user && dayCount >= user.maxBidsPerDay) add('cap', 'Daily bid limit reached', `${dayCount} of ${user.maxBidsPerDay} in 24 hours. Raise it under Settings → Auto-Bidding or wait.`);
  if (pendingReview > 0) add('review', `${pendingReview} draft${pendingReview === 1 ? ' is' : 's are'} waiting for your review`, 'Drafts count toward the bid limits until you approve or dismiss them.');

  // 3. Problems the engine reported in the window.
  const problems = await prisma.activityLog.findMany({
    where: { userId, action: { in: Object.keys(PROBLEM_ACTIONS) }, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { action: true, details: true },
  });
  for (const p of problems) {
    const d = parse(p.details);
    add(p.action, PROBLEM_ACTIONS[p.action], d.message || d.reason || d.error || null);
  }

  // 4. What the runs in the window did with the projects they found.
  const runRows = await prisma.activityLog.findMany({
    where: { userId, action: 'scheduler_run_completed', createdAt: { gte: since } },
    select: { details: true },
  });
  // `skipped` counts runs that stopped before searching Freelancer (no bids
  // left, bid cap, not connected…); `skippedReason` is the first reason seen.
  const runs = { count: runRows.length, searched: 0, filtered: 0, analyzed: 0, qualified: 0, errors: 0, openaiError: null, skipped: 0, skippedReason: null };
  for (const row of runRows) {
    const r = parse(row.details).results || {};
    for (const k of ['searched', 'filtered', 'analyzed', 'qualified', 'errors']) runs[k] += Number(r[k]) || 0;
    if (r.openaiError && !runs.openaiError) runs.openaiError = r.openaiError;
    if (r.skipped && !(Number(r.searched) > 0)) {
      runs.skipped += 1;
      if (!runs.skippedReason) runs.skippedReason = r.skipped;
    }
  }
  const bidErrors = await prisma.bid.count({ where: { userId, status: 'error', createdAt: { gte: since } } });

  const engineCouldRun = status.running && activeProfiles.length > 0 && token && user?.openaiApiKey;
  if (runs.count === 0) {
    if (engineCouldRun && schedule.allowed && !problems.length && !runAgeMs) {
      add('no_runs', 'No bidding run finished in the last two hours', 'The app was probably closed or the computer asleep. Keep BidPilot running (minimized to the tray is fine).');
    }
  } else if (engineCouldRun) {
    const minScore = Math.min(...activeProfiles.map(p => p.minRelevanceScore ?? 70));
    if (runs.searched === 0 && runs.skipped > 0) {
      // The runs never asked Freelancer for projects, so this is not a search
      // problem. The cause is normally listed already (sections 1 and 3); if
      // its log entry fell outside the window, name it here.
      add(runs.skippedReason, PROBLEM_ACTIONS[runs.skippedReason] || 'The runs stopped before searching',
        `${runs.skipped} of the last ${runs.count} run${runs.count === 1 ? '' : 's'} stopped before searching Freelancer. Activity Logs has the details.`);
    } else if (runs.searched === 0) {
      add('no_projects', 'Freelancer returned no projects', `${runs.count} run${runs.count === 1 ? '' : 's'} searched and found nothing. The Job Filters' languages and allowed countries narrow the search; check them.`);
    } else if (runs.filtered === 0) {
      add('all_filtered', 'Every project found was already bid on, scored too low earlier, or removed by your Job Filters', `${runs.searched} found across ${runs.count} run${runs.count === 1 ? '' : 's'}, none left to analyze. Loosen the Job Filters (budget, countries, currencies) or lower the minimum relevance to see more.`);
    } else if (runs.analyzed === 0 && runs.errors > 0) {
      add('openai_failed', 'OpenAI could not analyze the projects', runs.openaiError || `${runs.errors} error${runs.errors === 1 ? '' : 's'} while scoring. Check the key and billing under Settings → OpenAI.`);
    } else if (runs.analyzed > 0 && runs.qualified === 0) {
      add('not_relevant', 'No project scored high enough', `${runs.analyzed} analyzed, none reached the minimum relevance of ${minScore}. Lower the minimum on the profile, or add skills under Settings → Freelancer Profile.`);
    } else if (runs.qualified > 0) {
      add('skipped', 'Projects qualified, but no bid was created', bidErrors > 0
        ? `${bidErrors} bid${bidErrors === 1 ? '' : 's'} failed when sent. Open the Errors filter for the messages.`
        : 'The proposal prompt chose to skip them (design, social-media or adult work) or pricing failed. Activity Logs has the details.');
    }
  }

  if (reasons.length === 0) {
    add('unknown', 'No clear cause found', 'Open Activity Logs and read the latest BidPilot Run Completed entry for the counts.');
  }

  return { idle: true, lastBidAt, windowMinutes: windowMs / 60000, reasons, runs, bidErrors };
}

module.exports = { explainIdle, IDLE_WINDOW_MS };
