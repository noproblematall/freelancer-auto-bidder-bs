// Labels for the engine's per-project decisions (backend
// services/bidding/engine.js `decide`). The short text goes on the badge,
// the detail (stored on the project) in the tooltip / detail modal.
const REASONS = {
  bid: 'Bid placed',
  queued: 'Draft waiting for review',
  not_reached: 'Waiting for next run',
  excluded_country: 'Country excluded',
  excluded_region: 'Region excluded',
  excluded_currency: 'Currency excluded',
  budget: 'Budget outside range',
  too_many_bids: 'Too many bids already',
  low_client_score: 'Client score too low',
  low_score: 'Relevance too low',
  prompt_skip: 'Prompt rules: no bid',
  analyze_error: 'AI check failed',
  proposal_error: 'Proposal failed',
  pricing_error: 'Pricing failed',
  bid_error: 'Freelancer rejected bid',
  pipeline_error: 'Error',
}

const TONES = {
  bid: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  queued: 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
  waiting: 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400',
  skipped: 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300',
  error: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400',
}

export function decisionLabel(project) {
  if (!project?.decision) return null
  return REASONS[project.decisionReason] || (project.decision === 'skipped' ? 'Skipped' : project.decision)
}

export function decisionTone(project) {
  return TONES[project?.decision] || TONES.skipped
}

export function decisionDetail(project) {
  return project?.decisionDetail || ''
}
