import { useState, useEffect } from 'react'
import { useActivity } from '../hooks/useActivity'
import { timeAgo } from '../utils/formatters'

const LIMIT = 20

const FILTER_OPTIONS = [
  { key: 'all', label: 'All Activities' },
  { key: 'scheduler', label: 'Scheduler' },
  { key: 'bids', label: 'Bids' },
  { key: 'profiles', label: 'Profiles' },
]

const ACTION_COLORS = {
  // Scheduler actions
  scheduler_check: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  scheduler_run_completed: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  scheduler_run_failed: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400',

  // Bid actions
  bid_placed: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  bid_retracted: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  bid_retried_success: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  bid_retried_failed: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400',

  // Profile actions
  profile_created: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  profile_updated: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  profile_deleted: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400',

  // Freelancer credentials
  freelancer_credentials_changed: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  freelancer_credentials_cleared: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400',

  // Operational problems — these explain why bidding stopped; never grey them out
  scheduler_auto_paused: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  openai_stall_detected: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  openai_not_configured: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  token_refresh_failed: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  bid_queued_for_review: 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400',
  bid_placed_manual: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',

  // Default
  default: 'bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-200',
}

const ACTION_LABELS = {
  scheduler_check: 'Scheduler Check',
  scheduler_run_completed: 'Growlance Run Completed',
  scheduler_run_failed: 'Growlance Run Failed',
  scheduler_auto_paused: 'Auto-Paused (all profiles deactivated)',
  openai_stall_detected: 'OpenAI Stall Detected',
  openai_not_configured: 'OpenAI Not Configured',
  token_refresh_failed: 'Freelancer Connection Expired',
  bid_placed: 'Bid Placed',
  bid_placed_manual: 'Bid Approved & Placed',
  bid_queued_for_review: 'Draft Queued for Review',
  bid_cancelled: 'Bid Cancelled',
  bid_converted: 'Bid Converted (client replied)',
  bid_error: 'Bid Failed',
  bid_retracted: 'Bid Retracted',
  bid_retried_success: 'Bid Retry Success',
  bid_retried_failed: 'Bid Retry Failed',
  profile_created: 'Profile Created',
  profile_updated: 'Profile Updated',
  profile_deleted: 'Profile Deleted',
  freelancer_credentials_changed: 'Freelancer Credentials Updated',
  freelancer_credentials_cleared: 'Freelancer Credentials Cleared',
}

export default function ActivityLogsPage() {
  const { logs, totalCount, stats, loading, error, fetchLogs, fetchStats } = useActivity()
  const [activeFilter, setActiveFilter] = useState('all')
  const [offset, setOffset] = useState(0)
  const [expandedLog, setExpandedLog] = useState(null)

  useEffect(() => {
    fetchLogs({ limit: LIMIT, offset: 0 })
    fetchStats()
  }, [fetchLogs, fetchStats])

  function handleFilterChange(filterKey) {
    setActiveFilter(filterKey)
    setOffset(0)
    fetchLogs({ limit: LIMIT, offset: 0, action: filterKey })
  }

  function handlePrev() {
    const newOffset = Math.max(0, offset - LIMIT)
    setOffset(newOffset)
    fetchLogs({ limit: LIMIT, offset: newOffset, action: activeFilter === 'all' ? undefined : activeFilter })
  }

  function handleNext() {
    const newOffset = offset + LIMIT
    setOffset(newOffset)
    fetchLogs({ limit: LIMIT, offset: newOffset, action: activeFilter === 'all' ? undefined : activeFilter })
  }

  function formatActionLabel(action) {
    return ACTION_LABELS[action] || action.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  function renderDetails(log) {
    if (!log.details) return null

    const details = log.details

    // Scheduler check
    if (log.action === 'scheduler_check') {
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              details.allowed ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
            }`}>
              {details.allowed ? 'Allowed' : 'Blocked'}
            </span>
            {details.reason && <span className="text-xs text-slate-600 dark:text-slate-400">{details.reason}</span>}
          </div>
        </div>
      )
    }

    // Scheduler run completed
    if (log.action === 'scheduler_run_completed') {
      const duration = details.durationMs ? (details.durationMs / 1000).toFixed(2) : 'N/A'
      return (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-slate-500 dark:text-slate-400">Profiles:</span> <span className="font-medium">{details.profileCount || 0}</span></div>
          <div><span className="text-slate-500 dark:text-slate-400">Bids Placed:</span> <span className="font-medium text-emerald-600 dark:text-emerald-400">{details.results?.placed || 0}</span></div>
          {details.results?.queued > 0 && (
            <div><span className="text-slate-500 dark:text-slate-400">Queued for Review:</span> <span className="font-medium text-violet-600 dark:text-violet-400">{details.results.queued}</span></div>
          )}
          <div><span className="text-slate-500 dark:text-slate-400">Projects Searched:</span> <span className="font-medium">{details.results?.searched || 0}</span></div>
          <div><span className="text-slate-500 dark:text-slate-400">Duration:</span> <span className="font-medium">{duration}s</span></div>
        </div>
      )
    }

    // Scheduler run failed
    if (log.action === 'scheduler_run_failed') {
      return (
        <div className="text-xs text-red-600 dark:text-red-400">
          Error: {details.error || 'Unknown error'}
        </div>
      )
    }

    // Operational problems: render the human message, never a JSON blob
    if (['scheduler_auto_paused', 'openai_stall_detected', 'openai_not_configured', 'token_refresh_failed'].includes(log.action)) {
      return (
        <div className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
          {(details.message || details.reason) && <div>{details.message || details.reason}</div>}
          {details.suggestion && <div className="text-slate-600 dark:text-slate-400">{details.suggestion}</div>}
          {details.errors !== undefined && <div className="text-slate-500 dark:text-slate-500">{details.errors} error(s) in the last run</div>}
        </div>
      )
    }

    // Bid actions
    if (log.action.startsWith('bid_')) {
      return (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {details.bidId && <div><span className="text-slate-500 dark:text-slate-400">Bid ID:</span> <span className="font-medium">#{details.bidId}</span></div>}
          {details.projectId && <div><span className="text-slate-500 dark:text-slate-400">Project ID:</span> <span className="font-medium">#{details.projectId}</span></div>}
          {details.freelancerBidId && <div><span className="text-slate-500 dark:text-slate-400">Freelancer Bid ID:</span> <span className="font-medium">{details.freelancerBidId}</span></div>}
          {details.error && <div className="col-span-2 text-red-600 dark:text-red-400">Error: {details.error}</div>}
        </div>
      )
    }

    // Profile actions
    if (log.action.startsWith('profile_')) {
      return (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {details.profileId && <div><span className="text-slate-500 dark:text-slate-400">Profile ID:</span> <span className="font-medium">#{details.profileId}</span></div>}
          {details.name && <div><span className="text-slate-500 dark:text-slate-400">Name:</span> <span className="font-medium">{details.name}</span></div>}
        </div>
      )
    }

    // Default: show raw JSON
    return (
      <pre className="text-xs text-slate-600 dark:text-slate-400 overflow-x-auto">
        {JSON.stringify(details, null, 2)}
      </pre>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-950 dark:text-white">Activity Logs</h1>
          <p className="text-sm text-slate-700 dark:text-slate-200 mt-1">
            Complete log of all application activities and events
          </p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50 p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Total Activities</p>
            <p className="text-2xl font-bold text-navy-900 dark:text-white mt-1">{stats.total}</p>
          </div>
          <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50 p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Last 24 Hours</p>
            <p className="text-2xl font-bold text-violet-700 dark:text-violet-400 mt-1">{stats.last24h}</p>
          </div>
          <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50 p-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Last 7 Days</p>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-400 mt-1">{stats.last7d}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map(f => (
          <button
            key={f.key}
            onClick={() => handleFilterChange(f.key)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeFilter === f.key
                ? 'bg-navy-900 dark:bg-emerald-400 text-white dark:text-navy-950'
                : 'bg-white dark:bg-navy-800/90 border border-slate-200 dark:border-white/6 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-navy-500'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && logs.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-navy-900 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-700 dark:text-slate-200">Loading logs...</p>
          </div>
        </div>
      )}

      {/* Logs List */}
      {logs.length > 0 && (
        <>
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLORS[log.action] || ACTION_COLORS.default}`}>
                        {formatActionLabel(log.action)}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {timeAgo(log.createdAt)}
                      </span>
                    </div>
                    {log.details && (
                      <div className="mt-2">
                        {renderDetails(log)}
                      </div>
                    )}
                  </div>
                  {log.details && (
                    <button
                      onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                      className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-navy-700 rounded-lg transition-colors"
                      title="View raw details"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d={expandedLog === log.id ? "m4.5 15.75 7.5-7.5 7.5 7.5" : "m19.5 8.25-7.5 7.5-7.5-7.5"} />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Expanded Raw JSON */}
                {expandedLog === log.id && log.details && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/8">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1.5">Raw Details</p>
                    <pre className="text-xs text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-navy-900/50 rounded-lg p-3 border border-slate-100 dark:border-white/8 overflow-x-auto">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Showing {offset + 1}–{Math.min(offset + LIMIT, totalCount)} of {totalCount}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handlePrev}
                disabled={offset === 0}
                className="px-3.5 py-2 text-sm font-medium bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={handleNext}
                disabled={offset + LIMIT >= totalCount}
                className="px-3.5 py-2 text-sm font-medium bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Empty State */}
      {logs.length === 0 && !loading && !error && (
        <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50">
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-navy-700 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-navy-950 dark:text-white mb-1">No activity logs yet</h3>
            <p className="text-sm text-slate-700 dark:text-slate-200 text-center max-w-sm">
              Activity logs will appear here as you use the application.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
