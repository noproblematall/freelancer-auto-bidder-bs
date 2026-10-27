import { useState, useEffect, useRef } from 'react'
import ThemeToggle from '../ThemeToggle'
import { getSchedulerStatus } from '../../services/scheduler'

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

export default function Header() {
  const [displayStatus, setDisplayStatus] = useState(null)
  const pollRef = useRef(null)
  const lastStatusRef = useRef(null)

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
