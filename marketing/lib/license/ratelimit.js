// Minimal per-IP sliding-window rate limiter for the unauthenticated write
// endpoints (trial issuance, checkout invoice creation).
//
// Honest scope: state is per serverless instance (module memory), so the cap
// is per-warm-instance, not global — a determined distributed attacker can
// exceed it. That's acceptable: the goal is stopping crawler loops and casual
// abuse scripts from bloating the DB / spamming Plisio on launch day without
// adding an external KV dependency. Memory is bounded by periodic pruning.

const buckets = new Map() // key -> array of hit timestamps (ms)
let lastPrune = 0

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  // Vercel sets x-forwarded-for; first entry is the client.
  return (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req.socket?.remoteAddress || 'unknown'
}

/**
 * Record a hit for `key` and return true if it is within `max` hits per
 * `windowMs`. False = over the limit (caller should 429).
 */
export function allow(key, max, windowMs) {
  const now = Date.now()

  // Prune old buckets at most once a minute so the map can't grow unbounded.
  if (now - lastPrune > 60000) {
    lastPrune = now
    for (const [k, hits] of buckets) {
      if (hits.length === 0 || now - hits[hits.length - 1] > windowMs) buckets.delete(k)
    }
  }

  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs)
  if (hits.length >= max) {
    buckets.set(key, hits)
    return false
  }
  hits.push(now)
  buckets.set(key, hits)
  return true
}
