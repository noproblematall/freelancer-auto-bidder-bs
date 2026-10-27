export function timeAgo(dateString) {
  if (!dateString) return ''
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000)
  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'week', seconds: 604800 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 },
  ]
  for (const { label, seconds: s } of intervals) {
    const count = Math.floor(seconds / s)
    if (count >= 1) return `${count} ${label}${count > 1 ? 's' : ''} ago`
  }
  return 'just now'
}

export function formatBudget(min, max, currency = 'USD') {
  const fmt = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(n)

  if (min && max) return `${fmt(min)} – ${fmt(max)}`
  if (min) return `${fmt(min)}+`
  if (max) return `Up to ${fmt(max)}`
  return 'Open budget'
}

export function formatAmount(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount)
}

export function parseJobIds(jobIdsStr) {
  if (!jobIdsStr) return []
  try { return JSON.parse(jobIdsStr) } catch { return [] }
}
