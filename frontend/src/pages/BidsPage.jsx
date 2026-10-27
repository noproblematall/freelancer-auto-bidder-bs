import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBids } from '../hooks/useBids'
import { useConfirm } from '../components/ConfirmDialog'
import { timeAgo, formatAmount } from '../utils/formatters'

const LIMIT = 20

const _regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

function getCountryInfo(code) {
  if (!code || code.length !== 2) return null
  const upper = code.toUpperCase()
  // Skip currency zone codes (EU = Eurozone) — not actual country codes
  if (upper === 'EU') return null
  const flag = String.fromCodePoint(
    0x1F1E6 - 65 + upper.charCodeAt(0),
    0x1F1E6 - 65 + upper.charCodeAt(1)
  )
  let name = upper
  try { name = _regionNames.of(upper) || upper } catch {}
  return { flag, name }
}
const POLL_INTERVAL = 15000 // 15 seconds
const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'pending_review', label: 'Needs Review' },
  { key: 'placed', label: 'Placed' },
  { key: 'last-hour', label: 'Last Hour' },
  { key: 'last-24h', label: 'Last 24h' },
  { key: 'converted', label: 'Converted' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'retracted', label: 'Retracted' },
  { key: 'error', label: 'Errors' },
]

const STATUS_COLORS = {
  pending: 'bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-200',
  pending_review: 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
  placed: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  converted: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  rejected: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  retracted: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  cancelled: 'bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400',
  error: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400',
}

export default function BidsPage() {
  const { bids, totalCount, stats, loading, error, fetchBids, fetchStats, retract, retry, placeNow, cancel, update } = useBids()
  const confirm = useConfirm()
  const [searchParams] = useSearchParams()
  // Honor deep links like /bids?filter=converted (Dashboard stat cards)
  const [activeFilter, setActiveFilter] = useState(() => searchParams.get('filter') || 'all')
  const [offset, setOffset] = useState(0)
  const [expandedBid, setExpandedBid] = useState(null)
  const [retractingId, setRetractingId] = useState(null)
  const [retryingId, setRetryingId] = useState(null)
  const [placingNowId, setPlacingNowId] = useState(null)
  const [cancellingId, setCancellingId] = useState(null)
  const [retractError, setRetractError] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  // Review-and-send: inline editing of a queued draft before approving
  const [editingBidId, setEditingBidId] = useState(null)
  const [editProposal, setEditProposal] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editPeriod, setEditPeriod] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState(null)
  const [search, setSearch] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [newBidIds, setNewBidIds] = useState(new Set())
  const [placedBidIds, setPlacedBidIds] = useState(new Set())
  const pollIntervalRef = useRef(null)
  const previousBidIdsRef = useRef(new Set())
  const previousStatusesRef = useRef(new Map())
  const isInitialLoadRef = useRef(true)
  const searchDebounceRef = useRef(null)
  const searchRef = useRef('')

  // Initial load
  useEffect(() => {
    fetchBids({ limit: LIMIT, offset: 0 })
    fetchStats()
  }, [])

  // Track new bids and pending→placed transitions for animation
  useEffect(() => {
    if (bids.length > 0 && offset === 0) {
      const currentIds = new Set(bids.map(b => b.id))

      // Skip animation on initial load — just seed the refs
      if (isInitialLoadRef.current) {
        previousBidIdsRef.current = currentIds
        previousStatusesRef.current = new Map(bids.map(b => [b.id, b.status]))
        isInitialLoadRef.current = false
        return
      }

      const newIds = new Set()
      const justPlacedIds = new Set()

      bids.forEach(bid => {
        if (!previousBidIdsRef.current.has(bid.id)) {
          newIds.add(bid.id)
        } else if (
          previousStatusesRef.current.get(bid.id) === 'pending' &&
          bid.status === 'placed'
        ) {
          justPlacedIds.add(bid.id)
        }
      })

      if (newIds.size > 0) {
        setNewBidIds(newIds)
        setTimeout(() => setNewBidIds(new Set()), 2000)
      }

      if (justPlacedIds.size > 0) {
        setPlacedBidIds(justPlacedIds)
        setTimeout(() => setPlacedBidIds(new Set()), 2000)
      }

      previousBidIdsRef.current = currentIds
      previousStatusesRef.current = new Map(bids.map(b => [b.id, b.status]))
    }
  }, [bids, offset])

  // Convert filter key to API query params
  function filterToParams(filterKey, searchTerm = search) {
    const params = {}
    if (filterKey === 'last-hour') params.since = '1h'
    else if (filterKey === 'last-24h') params.since = '24h'
    else if (filterKey !== 'all') params.status = filterKey
    if (searchTerm) params.search = searchTerm
    return params
  }

  function handleSearchChange(value) {
    setSearch(value)
    searchRef.current = value
    clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setOffset(0)
      fetchBids({ limit: LIMIT, offset: 0, ...filterToParams(activeFilter, value) })
    }, 300)
  }

  // Auto-refresh polling
  useEffect(() => {
    const refreshData = async () => {
      // Smart updates: only prepend new bids on first page
      const isFirstPage = offset === 0
      const prependNew = isFirstPage

      setIsRefreshing(true)
      const startTime = Date.now()

      await Promise.all([
        fetchBids(
          { limit: LIMIT, offset, ...filterToParams(activeFilter, searchRef.current) },
          { prependNew }
        ),
        fetchStats()
      ])

      // Ensure indicator shows for at least 1000ms
      const elapsed = Date.now() - startTime
      const remainingTime = Math.max(0, 1000 - elapsed)

      setTimeout(() => {
        setIsRefreshing(false)
      }, remainingTime)
    }

    // Start polling
    pollIntervalRef.current = setInterval(refreshData, POLL_INTERVAL)

    // Pause polling when tab is hidden
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
      } else {
        // Resume polling when tab becomes visible
        if (!pollIntervalRef.current) {
          refreshData() // Immediate refresh
          pollIntervalRef.current = setInterval(refreshData, POLL_INTERVAL)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Cleanup
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [offset, activeFilter])

  function handleFilterChange(filterKey) {
    setActiveFilter(filterKey)
    setOffset(0)
    // A filter switch surfaces different rows — they are not "new bids", so
    // don't greet them with the green pulse animation.
    isInitialLoadRef.current = true
    fetchBids({ limit: LIMIT, offset: 0, ...filterToParams(filterKey, search) })
  }

  function handlePrev() {
    const newOffset = Math.max(0, offset - LIMIT)
    setOffset(newOffset)
    fetchBids({ limit: LIMIT, offset: newOffset, ...filterToParams(activeFilter, search) })
  }

  function handleNext() {
    const newOffset = offset + LIMIT
    setOffset(newOffset)
    fetchBids({ limit: LIMIT, offset: newOffset, ...filterToParams(activeFilter, search) })
  }

  async function handleRetract(bid) {
    const confirmed = await confirm({
      title: 'Retract Bid',
      message: `Retract your ${formatAmount(bid.amount, bid.project?.currency)} bid on "${bid.project?.title}"? This will withdraw your bid from the project.`,
      confirmText: 'Retract',
      variant: 'danger'
    })
    if (!confirmed) return

    setRetractingId(bid.id)
    setRetractError(null)
    try {
      await retract(bid.id)
      fetchStats()
    } catch (err) {
      setRetractError(err.response?.data?.error || 'Failed to retract bid')
    } finally {
      setRetractingId(null)
    }
  }

  async function handleRetry(bid) {
    const confirmed = await confirm({
      title: 'Retry Bid',
      message: `Retry placing your ${formatAmount(bid.amount, bid.project?.currency)} bid on "${bid.project?.title}"?`,
      confirmText: 'Retry',
      variant: 'default'
    })
    if (!confirmed) return

    setRetryingId(bid.id)
    setRetractError(null)
    try {
      await retry(bid.id)
      await fetchStats() // Refresh stats after retry
    } catch (err) {
      setRetractError(err.response?.data?.error || 'Failed to retry bid')
    } finally {
      setRetryingId(null)
    }
  }

  async function handlePlaceNow(bid) {
    const confirmed = await confirm({
      title: 'Bid Now',
      message: `Force-place your ${formatAmount(bid.amount, bid.project?.currency)} bid on "${bid.project?.title}" immediately, skipping the remaining delay?`,
      confirmText: 'Bid Now',
      variant: 'default'
    })
    if (!confirmed) return

    setPlacingNowId(bid.id)
    setRetractError(null)
    try {
      await placeNow(bid.id)
      await fetchStats()
    } catch (err) {
      setRetractError(err.response?.data?.error || 'Failed to place bid')
    } finally {
      setPlacingNowId(null)
    }
  }

  async function handleCancel(bid) {
    const confirmed = await confirm({
      title: 'Cancel Bid',
      message: `Cancel the pending bid on "${bid.project?.title}"? The bid will not be placed.`,
      confirmText: 'Cancel Bid',
      variant: 'danger'
    })
    if (!confirmed) return

    setCancellingId(bid.id)
    setRetractError(null)
    try {
      await cancel(bid.id)
      await fetchStats()
    } catch (err) {
      setRetractError(err.response?.data?.error || 'Failed to cancel bid')
    } finally {
      setCancellingId(null)
    }
  }

  async function handleApprove(bid) {
    const confirmed = await confirm({
      title: 'Approve & Place Bid',
      message: `Place your ${formatAmount(bid.amount, bid.project?.currency)} bid on "${bid.project?.title}"?`,
      confirmText: 'Approve & Place',
      variant: 'default'
    })
    if (!confirmed) return

    setPlacingNowId(bid.id)
    setRetractError(null)
    try {
      await placeNow(bid.id)
      await fetchStats()
      if (editingBidId === bid.id) setEditingBidId(null)
    } catch (err) {
      setRetractError(err.response?.data?.error || 'Failed to place bid')
    } finally {
      setPlacingNowId(null)
    }
  }

  async function handleDismiss(bid) {
    const confirmed = await confirm({
      title: 'Dismiss Draft',
      message: `Dismiss the drafted bid on "${bid.project?.title}"? It will not be placed.`,
      confirmText: 'Dismiss',
      variant: 'danger'
    })
    if (!confirmed) return

    setCancellingId(bid.id)
    setRetractError(null)
    try {
      await cancel(bid.id)
      await fetchStats()
      if (editingBidId === bid.id) setEditingBidId(null)
    } catch (err) {
      setRetractError(err.response?.data?.error || 'Failed to dismiss draft')
    } finally {
      setCancellingId(null)
    }
  }

  function startEditBid(bid) {
    setEditingBidId(bid.id)
    setEditProposal(bid.proposalText || '')
    setEditAmount(String(bid.amount ?? ''))
    setEditPeriod(String(bid.periodDays ?? ''))
    setEditError(null)
    setExpandedBid(bid.id)
  }

  async function handleSaveEdit(bid) {
    setEditError(null)

    // Send only what actually changed — a price tweak must never be blocked by
    // validation on an untouched (e.g. over-long AI-drafted) proposal.
    const fields = {}
    if (editProposal !== bid.proposalText) {
      if (!editProposal.trim()) return setEditError('Proposal cannot be empty.')
      if (editProposal.length > 1500) {
        return setEditError(`Proposal is ${editProposal.length} characters — Freelancer's limit is 1500. Shorten it to save.`)
      }
      fields.proposalText = editProposal
    }
    if (String(editAmount) !== String(bid.amount)) {
      const amt = parseFloat(editAmount)
      if (!editAmount || isNaN(amt) || amt <= 0) return setEditError('Enter a valid amount.')
      fields.amount = editAmount
    }
    if (String(editPeriod) !== String(bid.periodDays)) {
      const per = parseInt(editPeriod)
      if (!editPeriod || isNaN(per) || per < 1) return setEditError('Enter a valid delivery period (days).')
      fields.periodDays = editPeriod
    }
    if (Object.keys(fields).length === 0) {
      setEditingBidId(null) // nothing changed — just close the editor
      return
    }

    setSavingEdit(true)
    try {
      await update(bid.id, fields)
      setEditingBidId(null)
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to save changes')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleCopyProposal(bid) {
    try {
      await navigator.clipboard.writeText(bid.proposalText)
      setCopiedId(bid.id)
      setTimeout(() => setCopiedId(null), 2000) // Reset after 2 seconds
    } catch (err) {
      setRetractError('Failed to copy proposal to clipboard')
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-950 dark:text-white">Bid History</h1>
        <p className="text-sm text-slate-700 dark:text-slate-200 mt-1">Track all bids placed by your active profiles</p>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total', value: stats.total, color: 'text-navy-950', darkColor: 'dark:text-emerald-400' },
            { label: 'Placed', value: stats.placed, color: 'text-blue-700', darkColor: 'dark:text-emerald-400' },
            { label: 'Last Hour', value: stats.thisHour, color: 'text-indigo-700', darkColor: 'dark:text-emerald-400' },
            { label: 'Last 24h', value: stats.last24h, color: 'text-violet-700', darkColor: 'dark:text-emerald-400' },
            { label: 'Errors', value: stats.errored, color: 'text-red-600', darkColor: 'dark:text-red-400' },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50 px-4 py-3">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{s.label}</p>
              <p className={`text-xl font-semibold ${s.color} ${s.darkColor}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Rate Limit Warnings */}
      {(stats?.limits?.hourly?.atLimit || stats?.limits?.daily?.atLimit) && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
          <div className="flex items-start gap-2.5">
            <svg className="w-4.5 h-4.5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Rate limit reached</p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {[
                  stats.limits.hourly.atLimit && `hourly limit (${stats.limits.hourly.used}/${stats.limits.hourly.limit})`,
                  stats.limits.daily.atLimit && `daily limit (${stats.limits.daily.used}/${stats.limits.daily.limit})`,
                ].filter(Boolean).join(' and ')}
                {' — bidding resumes when the window rolls over. Adjust the caps under Settings → Auto-Bidding.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar + Search */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5 flex-wrap flex-1">
          {FILTER_OPTIONS.map((f) => (
            <button
              key={f.key}
              onClick={() => handleFilterChange(f.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeFilter === f.key
                  ? 'bg-navy-900 dark:bg-emerald-400 text-white dark:text-navy-950'
                  : 'bg-white dark:bg-navy-800/90 border border-slate-200 dark:border-white/6 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-navy-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {isRefreshing && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 shrink-0">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span>Refreshing...</span>
          </div>
        )}
        <div className="relative shrink-0">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            placeholder="Search by project title..."
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            className="pl-8 pr-8 py-1.5 text-xs bg-white dark:bg-navy-800/90 border border-slate-200 dark:border-white/6 rounded-lg text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-navy-400 dark:focus:ring-emerald-500 w-52"
          />
          {search && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Review queue callout */}
      {stats?.pendingReview > 0 && activeFilter !== 'pending_review' && (
        <button
          onClick={() => handleFilterChange('pending_review')}
          className="w-full p-3 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 text-sm text-violet-700 dark:text-violet-300 text-left hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
        >
          <span className="font-semibold">{stats.pendingReview} draft{stats.pendingReview === 1 ? '' : 's'}</span> waiting for your review — click to see them
        </button>
      )}

      {/* Error */}
      {(error || retractError) && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          {error || retractError}
        </div>
      )}

      {/* Loading (only show on initial load when no bids yet) */}
      {loading && bids.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-navy-900 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-700 dark:text-slate-400">Loading bids...</p>
          </div>
        </div>
      )}

      {/* Bid List */}
      {bids.length > 0 && (
        <>
          <div className="relative">
            <div className="space-y-3">
            {bids.map((bid) => (
              <div
                key={bid.id}
                className={`rounded-xl border shadow-lg dark:shadow-2xl dark:shadow-black/50 p-5 transition-colors duration-700 ${
                  newBidIds.has(bid.id)
                    ? 'animate-pulse bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-500'
                    : placedBidIds.has(bid.id)
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600'
                      : 'bg-white dark:bg-navy-800/90 border-slate-200 dark:border-white/6'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-navy-950 dark:text-white truncate" title={bid.project?.title || ''}>
                        {bid.project?.title || `Project #${bid.projectId}`}
                      </h3>
                      {bid.project?.freelancerProjectId && (
                        <a
                          href={`https://www.freelancer.com/projects/${bid.project.freelancerProjectId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 p-1 text-slate-500 dark:text-slate-400 hover:text-navy-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-navy-700 rounded transition-colors"
                          title="Open project on Freelancer.com"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      )}
                      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full transition-colors duration-500 ${STATUS_COLORS[bid.status] || STATUS_COLORS.pending}`}>
                        {bid.status === 'pending_review' ? 'needs review' : bid.status}
                      </span>
                      {bid.sealed && (
                        <span
                          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                          title="Sealed bid — hidden from other freelancers ($0.10)"
                        >
                          🔒 Sealed
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {bid.project?.projectType && (
                        <span className={`font-medium px-1.5 py-0.5 rounded ${
                          bid.project.projectType === 'hourly'
                            ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                            : 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'
                        }`}>
                          {bid.project.projectType === 'hourly' ? 'Hourly' : 'Fixed'}
                        </span>
                      )}
                      {(() => {
                        const ci = getCountryInfo(bid.project?.ownerCountry)
                        return ci ? (
                          <span className="flex items-center gap-1">
                            <span className="text-base leading-none">{ci.flag}</span>
                            <span>{ci.name} ({bid.project.ownerCountry})</span>
                          </span>
                        ) : null
                      })()}
                      <span>{bid.periodDays} days</span>
                      <span>{bid.milestonePercentage}% milestone</span>
                      {bid.profile && <span className="text-navy-500 dark:text-emerald-400">via {bid.profile.name}</span>}
                      {bid.placedAt && <span>{timeAgo(bid.placedAt)}</span>}
                      {!bid.placedAt && bid.createdAt && <span>{timeAgo(bid.createdAt)}</span>}
                    </div>
                    {bid.errorMessage && (
                      <p className="text-xs text-red-500 dark:text-red-400 mt-1.5">{bid.errorMessage}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-3">
                    <p className="text-lg font-medium text-emerald-500">{formatAmount(bid.amount, bid.project?.currency)}</p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setExpandedBid(expandedBid === bid.id ? null : bid.id)}
                        className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-navy-700 rounded-lg transition-colors"
                        title="View proposal"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d={expandedBid === bid.id ? "m4.5 15.75 7.5-7.5 7.5 7.5" : "m19.5 8.25-7.5 7.5-7.5-7.5"} />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleCopyProposal(bid)}
                        className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-navy-700 rounded-lg transition-colors"
                        title={copiedId === bid.id ? "Copied!" : "Copy proposal"}
                      >
                        {copiedId === bid.id ? (
                          <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                          </svg>
                        )}
                      </button>
                      {bid.status === 'pending_review' && (
                        <>
                          <button
                            onClick={() => handleApprove(bid)}
                            disabled={placingNowId === bid.id || cancellingId === bid.id || editingBidId === bid.id}
                            className="px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                            title={editingBidId === bid.id ? 'Save your edits first' : 'Place this bid on Freelancer'}
                          >
                            {placingNowId === bid.id ? 'Placing...' : 'Approve & Place'}
                          </button>
                          <button
                            onClick={() => (editingBidId === bid.id ? setEditingBidId(null) : startEditBid(bid))}
                            disabled={placingNowId === bid.id || cancellingId === bid.id}
                            className="px-2.5 py-1 text-xs font-medium text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors disabled:opacity-50"
                          >
                            {editingBidId === bid.id ? 'Discard Edits' : 'Edit'}
                          </button>
                          <button
                            onClick={() => handleDismiss(bid)}
                            disabled={cancellingId === bid.id || placingNowId === bid.id}
                            className="px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
                          >
                            {cancellingId === bid.id ? 'Dismissing...' : 'Dismiss'}
                          </button>
                        </>
                      )}
                      {bid.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handlePlaceNow(bid)}
                            disabled={placingNowId === bid.id || cancellingId === bid.id}
                            className="px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                          >
                            {placingNowId === bid.id ? 'Placing...' : 'Bid Now'}
                          </button>
                          <button
                            onClick={() => handleCancel(bid)}
                            disabled={cancellingId === bid.id || placingNowId === bid.id}
                            className="px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
                          >
                            {cancellingId === bid.id ? 'Cancelling...' : 'Cancel'}
                          </button>
                        </>
                      )}
                      {bid.status === 'error' && !bid.errorMessage?.toLowerCase().includes('already placed') && (
                        <>
                          <button
                            onClick={() => handleRetry(bid)}
                            disabled={retryingId === bid.id}
                            className="px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
                          >
                            {retryingId === bid.id ? 'Retrying...' : 'Retry'}
                          </button>
                          {/* Failed bids are editable so a rejected proposal (e.g.
                              over-long) can be fixed before Retry — without this,
                              error bids retry the same broken payload forever. */}
                          <button
                            onClick={() => (editingBidId === bid.id ? setEditingBidId(null) : startEditBid(bid))}
                            disabled={retryingId === bid.id}
                            className="px-2.5 py-1 text-xs font-medium text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors disabled:opacity-50"
                          >
                            {editingBidId === bid.id ? 'Discard Edits' : 'Edit'}
                          </button>
                        </>
                      )}
                      {bid.status === 'placed' && (
                        <button
                          onClick={() => handleRetract(bid)}
                          disabled={retractingId === bid.id}
                          className="px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-navy-700 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-200 dark:hover:bg-navy-600 transition-colors disabled:opacity-50"
                        >
                          {retractingId === bid.id ? 'Retracting...' : 'Retract'}
                        </button>
                      )}
                      {bid.status === 'retracted' && (
                        <button
                          onClick={() => handleRetry(bid)}
                          disabled={retryingId === bid.id}
                          className="px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
                        >
                          {retryingId === bid.id ? 'Retrying...' : 'Retry'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Inline editor for queued drafts (review-and-send) */}
                {editingBidId === bid.id && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/8 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-violet-600 dark:text-violet-300 uppercase">Edit draft</p>
                      <span className={`text-xs font-medium ${editProposal.length > 1500 ? 'text-red-500' : 'text-slate-400'}`}>
                        {editProposal.length} / 1500 characters
                      </span>
                    </div>
                    <textarea
                      value={editProposal}
                      onChange={(e) => setEditProposal(e.target.value)}
                      rows={8}
                      className="w-full px-3 py-2 text-sm border border-violet-200 dark:border-violet-800 rounded-lg bg-white dark:bg-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 leading-relaxed"
                    />
                    <div className="flex items-end gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Amount</label>
                        <input
                          type="number"
                          min="1"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-28 px-3 py-1.5 text-sm border border-slate-300 dark:border-white/10 rounded-lg bg-white dark:bg-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Delivery (days)</label>
                        <input
                          type="number"
                          min="1"
                          value={editPeriod}
                          onChange={(e) => setEditPeriod(e.target.value)}
                          className="w-24 px-3 py-1.5 text-sm border border-slate-300 dark:border-white/10 rounded-lg bg-white dark:bg-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                        />
                      </div>
                      <button
                        onClick={() => handleSaveEdit(bid)}
                        disabled={savingEdit}
                        className="px-3.5 py-1.5 text-sm font-medium text-white dark:text-navy-950 bg-navy-900 dark:bg-emerald-400 rounded-lg hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors disabled:opacity-50"
                      >
                        {savingEdit ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                    {editError && (
                      <p className="text-sm font-medium text-red-600 dark:text-red-400">{editError}</p>
                    )}
                  </div>
                )}

                {/* Expanded Proposal */}
                {expandedBid === bid.id && editingBidId !== bid.id && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/8">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Proposal</p>
                      <button
                        onClick={() => handleCopyProposal(bid)}
                        className="px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-navy-700 rounded hover:bg-slate-200 dark:hover:bg-navy-600 transition-colors flex items-center gap-1"
                      >
                        {copiedId === bid.id ? (
                          <>
                            <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Copied!
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                            </svg>
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                    <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap bg-slate-50 dark:bg-navy-900/50 rounded-lg p-3 border border-slate-100 dark:border-white/8">
                      {bid.proposalText}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

            {/* Pagination */}
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-slate-700 dark:text-slate-400">
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
          </div>
        </>
      )}

      {/* Empty State */}
      {bids.length === 0 && !loading && !error && (
        <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50">
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-navy-700 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            {activeFilter !== 'all' || search ? (
              <>
                <h3 className="text-base font-semibold text-navy-950 dark:text-white mb-1">No bids match this view</h3>
                <p className="text-sm text-slate-700 dark:text-slate-200 text-center max-w-sm mb-3">
                  {search ? `No results for "${search}".` : 'Nothing with this status yet.'}
                </p>
                <button
                  onClick={() => { setSearch(''); searchRef.current = ''; handleFilterChange('all') }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-navy-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-navy-600 transition-colors"
                >
                  Show all bids
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-navy-950 dark:text-white mb-1">No bids placed yet</h3>
                <p className="text-sm text-slate-700 dark:text-slate-200 text-center max-w-sm">
                  Once you start bidding on projects, your bid history will appear here.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
