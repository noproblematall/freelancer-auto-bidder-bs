import { useState, useEffect, useRef } from 'react'
import ThemeToggle from '../ThemeToggle'
import { getSchedulerStatus } from '../../services/scheduler'
import { getBidQuota } from '../../services/bids'

// Derive a single status string from the API payload
function deriveStatus(s) {
  if (!s) return null
  if (!s.running) return 'off'
  if (!s.scheduleAllowed) return 'paused'
  if (s.processing) return 'bidding'
  return 'active'
}

const BADGE = {
  bidding: {
    badge: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700',
    dot:   'bg-emerald-500 animate-pulse',
    label: 'Bidding...',
  },
  active: {
    badge: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700',
    dot:   'bg-emerald-500',
    label: 'Active',
  },
  paused: {
    badge: 'bg-slate-50 dark:bg-navy-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/8',
    dot:   'bg-slate-300 dark:bg-slate-600',
    label: 'Paused',
  },
  off: {
    badge: 'bg-slate-50 dark:bg-navy-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/8',
    dot:   'bg-slate-300 dark:bg-slate-600',
    label: 'Off',
  },
}

const POLL_INTERVAL = 10000
const QUOTA_POLL_EVERY = 6 // quota is refreshed every 6th status poll (1 minute)

// Freelancer bids left on the account, shown next to the engine status.
function BidQuotaPill({ quota, onRefresh }) {
  if (!quota || !quota.connected) return null
  const { remaining, limit } = quota
  const unknown = remaining === null || remaining === undefined
  const empty = !unknown && remaining <= 0
  const low = !unknown && !empty && remaining <= 5
  const cls = empty
    ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
    : low
      ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700'
      : 'bg-slate-50 dark:bg-navy-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/8'
  const title = empty
    ? 'Your Freelancer account has no bids left. Bidding is paused and nothing is sent to OpenAI until bids refill or you upgrade the membership.'
    : unknown
      ? 'Freelancer did not report how many bids are left on the account. Click to re-check.'
      : `Bids left on your Freelancer account${limit !== null && limit !== undefined ? ` (membership allowance ${limit})` : ''}. Click to re-check.`
  return (
    <button
      type="button"
      onClick={onRefresh}
      title={title}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${cls}`}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
      </svg>
      {empty ? 'No Freelancer bids left' : unknown ? 'Bids left: ?' : `Bids left: ${remaining}${limit !== null && limit !== undefined ? ` / ${limit}` : ''}`}
    </button>
  )
}

export default function Header() {
  const [displayStatus, setDisplayStatus] = useState(null)
  const [quota, setQuota] = useState(null)
  const pollRef = useRef(null)
  const lastStatusRef = useRef(null)
  const tickRef = useRef(0)

  const refreshQuota = (force = false) => {
    getBidQuota(force).then(setQuota).catch(() => {})
  }

  useEffect(() => {
    const poll = () => {
      getSchedulerStatus()
        .then(s => {
          const next = deriveStatus(s)
          if (next !== lastStatusRef.current) {
            lastStatusRef.current = next
            setDisplayStatus(next)
          }
        })
        .catch(() => {})
      if (tickRef.current++ % QUOTA_POLL_EVERY === 0) refreshQuota()
    }

    poll()
    pollRef.current = setInterval(poll, POLL_INTERVAL)

    const handleVisibility = () => {
      if (document.hidden) {
        clearInterval(pollRef.current)
        pollRef.current = null
      } else if (!pollRef.current) {
        poll()
        pollRef.current = setInterval(poll, POLL_INTERVAL)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(pollRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const badge = displayStatus ? BADGE[displayStatus] : null

  return (
    <header className="fixed top-0 left-64 right-0 h-16 flex items-center justify-end px-8 z-20" style={{ WebkitAppRegion: 'drag' }}>
      <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' }}>
        <BidQuotaPill quota={quota} onRefresh={() => refreshQuota(true)} />
        {badge && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${badge.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
            {badge.label}
          </div>
        )}
        <ThemeToggle />
      </div>
    </header>
  )
}
