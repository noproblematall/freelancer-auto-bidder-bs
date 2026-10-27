import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getBidStats, getBidHistory } from '../services/bids'
import { getProfiles } from '../services/profiles'
import { getProjects } from '../services/projects'
import { timeAgo, formatAmount } from '../utils/formatters'
import api from '../services/api'
import BidHistoryChart from '../components/Charts/BidHistoryChart'
import StatusDistributionChart from '../components/Charts/StatusDistributionChart'

export default function DashboardPage() {
  const { freelancer, user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [schedulerActivity, setSchedulerActivity] = useState([])
  const [chartData, setChartData] = useState(null)
  const [period, setPeriod] = useState('7d')
  const [insights, setInsights] = useState([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [runningBidder, setRunningBidder] = useState(false)
  const [runBidderMessage, setRunBidderMessage] = useState(null)
  const [setupDismissed, setSetupDismissed] = useState(() => localStorage.getItem('setupChecklistDismissed') === '1')
  const [chartError, setChartError] = useState(false)
  const pollIntervalRef = useRef(null)

  useEffect(() => {
    loadDashboard(period)
    loadChartData(period)
  }, [period])

  async function loadChartData(p = period) {
    try {
      const data = await getBidHistory(p)
      setChartData(data)
      setChartError(false)
    } catch {
      // Distinguish "couldn't load" from an eternal loading spinner
      setChartError(true)
    }
  }

  async function loadDashboard(p = period) {
    try {
      const [bidStats, profileData, projectData] = await Promise.all([
        getBidStats(p).catch(() => null),
        getProfiles().catch(() => ({ profiles: [] })),
        getProjects({ limit: 1, offset: 0 }).catch(() => ({ totalCount: 0 })),
      ])

      const activeProfiles = profileData.profiles.filter(p => p.isActive).length
      const successRate = bidStats && bidStats.placed > 0
        ? `${Math.round((bidStats.converted / bidStats.placed) * 100)}%`
        : '---'

      setStats({
        activeProfiles,
        profileCount: profileData.profiles.length,
        projectsFound: projectData.totalCount || 0,
        bidsPlaced: bidStats?.placed || 0,
        successRate,
      })

      // Generate insights
      const generatedInsights = generateInsights(bidStats, activeProfiles, projectData.totalCount || 0)
      setInsights(generatedInsights)
    } catch {
      // fail silently
    }

    // Load recent bid activity
    try {
      const { data } = await api.get('/bids', { params: { limit: 5, sortBy: 'createdAt', sortOrder: 'desc' } })
      setActivity(data.bids || [])
    } catch {
      // fail silently
    }

    // Load scheduler activity
    try {
      const { data } = await api.get('/scheduler/activity', { params: { limit: 10 } })
      setSchedulerActivity(data.logs || [])
    } catch {
      // fail silently
    }
  }

  function generateInsights(bidStats, activeProfiles, projectsFound) {
    const insights = []

    // Config insights don't depend on bid stats — they must show even when the
    // stats call failed (that's exactly when a misconfigured user needs them).
    if (!freelancer?.connected) {
      insights.push({
        id: 'no-freelancer',
        type: 'info',
        title: 'Freelancer Not Connected',
        message: 'Connect your Freelancer.com account to start finding projects.',
        action: { label: 'Connect Now', path: '/settings' }
      })
    }
    if (!user?.openaiConfigured) {
      insights.push({
        id: 'no-ai',
        type: 'info',
        title: 'AI Not Configured',
        message: 'Configure OpenAI to enable automatic proposal generation.',
        action: { label: 'Configure Now', path: '/settings' }
      })
    }
    // Projects available but no active profiles
    if (projectsFound > 0 && activeProfiles === 0) {
      insights.push({
        id: 'projects-no-profiles',
        type: 'info',
        title: 'Projects Available',
        message: `${projectsFound} projects found but no active profiles. Activate a profile to start bidding.`,
        action: { label: 'Activate Profile', path: '/profiles' }
      })
    }

    if (!bidStats) return insights

    // High success rate celebration
    if (bidStats.placed >= 10 && (bidStats.converted / bidStats.placed) > 0.3) {
      insights.push({
        id: 'high-success',
        type: 'success',
        title: 'Excellent Performance!',
        message: `Your ${Math.round((bidStats.converted / bidStats.placed) * 100)}% conversion rate is above average.`,
      })
    }

    // Low activity warning
    if (bidStats.placed < 5 && activeProfiles > 0) {
      insights.push({
        id: 'low-activity',
        type: 'warning',
        title: 'Low Bidding Activity',
        message: `Only ${bidStats.placed} bids placed. Consider broadening your profile search criteria.`,
        action: { label: 'Edit Profiles', path: '/profiles' }
      })
    }

    return insights
  }

  // Auto-refresh polling — recreates when period changes so the interval always uses current period
  useEffect(() => {
    const refreshData = async () => {
      setIsRefreshing(true)
      await Promise.all([loadDashboard(period), loadChartData(period)])
      setLastUpdated(new Date())
      setIsRefreshing(false)
    }

    pollIntervalRef.current = setInterval(refreshData, 30000) // 30 seconds

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [period])

  // Manual refresh mirrors the 30s poll: spinner + "last updated" both move,
  // so clicking the button visibly does something.
  async function handleManualRefresh() {
    setIsRefreshing(true)
    await Promise.all([loadDashboard(period), loadChartData(period)])
    setLastUpdated(new Date())
    setIsRefreshing(false)
  }

  const statCards = [
    { key: 'activeProfiles', label: 'Active Profiles', value: stats ? String(stats.activeProfiles) : '0', path: '/profiles' },
    { key: 'projectsFound', label: 'Projects Found', value: stats ? String(stats.projectsFound) : '0', path: '/projects' },
    { key: 'bidsPlaced', label: 'Bids Placed', value: stats ? String(stats.bidsPlaced) : '0', path: '/bids' },
    { key: 'successRate', label: 'Conversion Rate', value: stats?.successRate || '---', accent: true, path: '/bids?filter=converted' },
  ]

  const STATUS_COLORS = {
    pending: 'bg-slate-100 text-slate-600',
    placed: 'bg-navy-50 text-navy-700',
    converted: 'bg-emerald-50 text-emerald-700',
    rejected: 'bg-red-50 text-red-600',
    retracted: 'bg-amber-50 text-amber-700',
    error: 'bg-red-50 text-red-600',
  }

  // Skeleton loader component
  function StatCardSkeleton() {
    return (
      <div className="bg-white dark:bg-navy-800/80 rounded-xl border border-slate-200 dark:border-white/6 p-6 shadow-sm animate-pulse">
        <div className="flex items-start justify-between mb-3">
          <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-navy-600" />
        </div>
        <div className="w-20 h-9 rounded bg-slate-200 dark:bg-navy-600 mb-2" />
        <div className="w-24 h-4 rounded bg-slate-100 dark:bg-navy-500" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy-950 dark:text-white">Dashboard</h1>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
          <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <div className={`w-2 h-2 rounded-full ${
              isRefreshing ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'
            }`} />
            <span>Last updated {timeAgo(lastUpdated)}</span>
          </div>
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            title="Refresh dashboard"
            className="p-2 hover:bg-slate-100 dark:hover:bg-navy-800 rounded-lg transition-colors disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
        </div>
      </div>

      {/* Getting-started checklist: the required sequence isn't guessable
          (connect → key → profile → activate), so spell it out until done. */}
      {stats && !setupDismissed && (() => {
        const steps = [
          { label: 'Connect your Freelancer.com account', done: !!freelancer?.connected, path: '/settings' },
          { label: 'Add your OpenAI API key', done: !!user?.openaiConfigured, path: '/settings' },
          { label: 'Create a bidding profile', done: stats.profileCount > 0, path: '/profiles' },
          { label: 'Activate a profile to start bidding', done: stats.activeProfiles > 0, path: '/profiles' },
        ]
        const remaining = steps.filter(s => !s.done).length
        if (remaining === 0) return null
        return (
          <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-emerald-200 dark:border-emerald-800/60 p-5 shadow-lg dark:shadow-2xl dark:shadow-black/50">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-navy-950 dark:text-white">
                Get set up ({steps.length - remaining}/{steps.length} done)
              </h2>
              <button
                onClick={() => { localStorage.setItem('setupChecklistDismissed', '1'); setSetupDismissed(true) }}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                title="Hide this checklist"
              >
                Dismiss
              </button>
            </div>
            <div className="space-y-2">
              {steps.map((step) => (
                <button
                  key={step.label}
                  onClick={() => !step.done && navigate(step.path)}
                  disabled={step.done}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left text-sm transition-colors ${
                    step.done
                      ? 'text-slate-400 dark:text-slate-500'
                      : 'text-navy-950 dark:text-white hover:bg-slate-50 dark:hover:bg-navy-700/50'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold ${
                    step.done
                      ? 'bg-emerald-500 text-white'
                      : 'border-2 border-slate-300 dark:border-slate-600'
                  }`}>
                    {step.done ? '✓' : ''}
                  </span>
                  <span className={step.done ? 'line-through' : ''}>{step.label}</span>
                  {!step.done && (
                    <svg className="w-3.5 h-3.5 ml-auto text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Stats Grid */}
      {stats === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <StatCardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat, idx) => (
            <button
              key={stat.label}
              onClick={() => navigate(stat.path)}
              className={`group text-left rounded-xl p-6 shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-300 ${
                stat.accent
                  ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-emerald-500/30 hover:shadow-emerald-500/40'
                  : 'bg-gradient-to-br from-white to-slate-50 dark:from-navy-700 dark:to-navy-800 border border-slate-200/60 dark:border-white/6 shadow-slate-900/5 hover:shadow-slate-900/10 dark:shadow-black/20 dark:hover:shadow-black/30'
              }`}
              style={{ animation: `slideUp 0.5s ease-out ${idx * 0.1}s both` }}
            >
              <div className="flex items-center justify-between mb-2">
                <p className={`text-sm font-medium ${stat.accent ? 'text-emerald-50' : 'text-slate-700 dark:text-slate-200'}`}>
                  {stat.label}
                </p>
                <svg className={`w-4 h-4 ${stat.accent ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'} group-hover:translate-x-1 transition-transform`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </div>
              <p className={`text-3xl font-bold tracking-tight ${
                stat.accent ? 'text-white' : 'bg-gradient-to-r from-navy-950 to-navy-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent'
              }`}>
                {stat.value}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Performance Insights */}
      {insights.length > 0 && (
        <div className="space-y-3">
          {insights.map(insight => (
            <div
              key={insight.id}
              className={`flex items-start gap-4 p-4 rounded-xl border ${
                insight.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' :
                insight.type === 'warning' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' :
                'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                insight.type === 'success' ? 'bg-emerald-500' :
                insight.type === 'warning' ? 'bg-amber-500' :
                'bg-blue-500'
              }`}>
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  {insight.type === 'success' && <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />}
                  {insight.type === 'warning' && <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />}
                  {insight.type === 'info' && <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />}
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-navy-950 dark:text-white">{insight.title}</h3>
                <p className="text-sm text-slate-700 dark:text-slate-200 mt-1">{insight.message}</p>
                {insight.action && (
                  <button
                    onClick={() => navigate(insight.action.path)}
                    className="text-sm font-medium text-navy-700 dark:text-navy-300 hover:text-navy-900 dark:hover:text-white mt-2 flex items-center gap-1"
                  >
                    {insight.action.label}
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bid Performance Charts */}
      <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 p-6 shadow-lg dark:shadow-2xl dark:shadow-black/50">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-navy-950 dark:text-white">Bid Performance</h2>
        </div>

        {chartData ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-4">Bids Over Time</h3>
              <BidHistoryChart data={chartData.history} period={period} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-4">Status Distribution</h3>
              <StatusDistributionChart data={chartData.statusDistribution} />
            </div>
          </div>
        ) : chartError ? (
          <div className="flex flex-col items-center justify-center h-[300px] gap-3 text-sm text-slate-500 dark:text-slate-400">
            <span>Couldn't load chart data.</span>
            <button
              onClick={() => loadChartData(period)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-navy-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-navy-600 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-sm text-slate-500 dark:text-slate-400">
            Loading chart data...
          </div>
        )}
      </div>

      {/* Quick Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scheduler Status Card */}
        <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 p-6 shadow-lg dark:shadow-2xl dark:shadow-black/50">
          <h2 className="text-lg font-semibold text-navy-950 dark:text-white mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            Schedule
          </h2>
          {user?.schedule?.enabled ? (
            <div className="space-y-3">
              {(() => {
                // Format time window
                const formatTime = (time) => {
                  const [hours, minutes] = time.split(':')
                  const h = parseInt(hours)
                  const ampm = h >= 12 ? 'PM' : 'AM'
                  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h
                  return `${displayHour}:${minutes} ${ampm}`
                }

                // Get timezone abbreviation
                const tzAbbr = user.schedule.timezone.split('/')[1]?.replace('_', ' ') || user.schedule.timezone

                // Format days
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                const activeDayNames = user.schedule.days.map(d => dayNames[d])
                const daysText = activeDayNames.length === 7
                  ? 'Every day'
                  : activeDayNames.length === 5 && activeDayNames.every(d => !['Sun', 'Sat'].includes(d))
                  ? 'Weekdays'
                  : activeDayNames.join(', ')

                // Calculate current status
                const now = new Date()
                const formatter = new Intl.DateTimeFormat('en-US', {
                  timeZone: user.schedule.timezone,
                  weekday: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })
                const parts = formatter.formatToParts(now)
                const get = (type) => parts.find(p => p.type === type)?.value
                const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 }
                const currentDay = dayMap[get('weekday')] ?? 0
                const currentTime = `${String(get('hour')).padStart(2, '0')}:${String(get('minute')).padStart(2, '0')}`

                const dayAllowed = user.schedule.days.includes(currentDay)
                const timeAllowed = currentTime >= user.schedule.startTime && currentTime < user.schedule.endTime
                const isActive = dayAllowed && timeAllowed

                return (
                  <>
                    <div className="py-2 border-b border-slate-100 dark:border-white/8">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Time Window</p>
                      <p className="text-sm font-medium text-navy-950 dark:text-white">
                        {formatTime(user.schedule.startTime)} - {formatTime(user.schedule.endTime)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{tzAbbr}</p>
                    </div>
                    <div className="py-2 border-b border-slate-100 dark:border-white/8">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Active Days</p>
                      <p className="text-sm font-medium text-navy-950 dark:text-white">{daysText}</p>
                    </div>
                    <div className="py-2">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Current Status</p>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                        isActive
                          ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                          : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          isActive ? 'bg-emerald-500' : 'bg-blue-500'
                        }`} />
                        {isActive ? 'Active' : 'Paused'}
                      </span>
                    </div>
                  </>
                )
              })()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <svg className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Schedule Disabled</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Growlance runs 24/7</p>
              <button
                onClick={() => navigate('/settings')}
                className="text-xs font-medium text-navy-700 dark:text-navy-300 hover:text-navy-900 dark:hover:text-white flex items-center gap-1"
              >
                Configure Schedule
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Connection Card */}
        <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 p-6 shadow-lg dark:shadow-2xl dark:shadow-black/50">
          <h2 className="text-lg font-semibold text-navy-950 dark:text-white mb-4">Connection Status</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-700 dark:text-slate-200">Freelancer.com</span>
              {/* Three states like Settings: an expired token means bidding is
                  dead even though "connected" — never show green for that. */}
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                freelancer.connected && !freelancer.expired
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : freelancer.connected
                    ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                    : 'bg-slate-100 dark:bg-navy-900 text-slate-700 dark:text-slate-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  freelancer.connected && !freelancer.expired ? 'bg-emerald-500'
                    : freelancer.connected ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'
                }`} />
                {freelancer.connected
                  ? freelancer.expired ? 'Token Expired' : 'Connected'
                  : 'Not Connected'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-700 dark:text-slate-200">OpenAI API</span>
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                user?.openaiConfigured
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : 'bg-slate-100 dark:bg-navy-900 text-slate-700 dark:text-slate-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  user?.openaiConfigured ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                }`} />
                {user?.openaiConfigured ? 'Configured' : 'Not Configured'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-700 dark:text-slate-200">Telegram Bot</span>
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                user?.telegram?.configured
                  ? user?.telegram?.enabled
                    ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400'
                    : 'bg-slate-100 dark:bg-navy-900 text-slate-700 dark:text-slate-200'
                  : 'bg-slate-100 dark:bg-navy-900 text-slate-700 dark:text-slate-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  user?.telegram?.configured && user?.telegram?.enabled
                    ? 'bg-sky-500'
                    : 'bg-slate-300 dark:bg-slate-600'
                }`} />
                {user?.telegram?.configured
                  ? user?.telegram?.enabled ? 'Active' : 'Configured'
                  : 'Not Configured'}
              </span>
            </div>
          </div>
        </div>

        {/* Recent Activity Card */}
        <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 p-6 shadow-lg dark:shadow-2xl dark:shadow-black/50">
          <h2 className="text-lg font-semibold text-navy-950 dark:text-white mb-4">Recent Bids</h2>
          {activity.length > 0 ? (
            <div className="space-y-3">
              {activity.map((bid) => (
                <div key={bid.id} className="flex items-center justify-between py-2 hover:bg-slate-50 dark:hover:bg-navy-700 rounded-lg px-2 -mx-2 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-navy-950 dark:text-white font-medium truncate">{bid.project?.title || 'Unknown Project'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{timeAgo(bid.placedAt || bid.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-sm font-medium text-emerald-500">{formatAmount(bid.amount, bid.project?.currency)}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[bid.status] || STATUS_COLORS.pending}`}>
                      {bid.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-center px-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-navy-100 to-slate-100 dark:from-navy-700 dark:to-navy-800 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-navy-400 dark:text-navy-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-navy-950 dark:text-white mb-2">No bids yet</h3>
              <p className="text-sm text-slate-700 dark:text-slate-200 mb-4 max-w-xs">
                Start by connecting your Freelancer account and activating a bidding profile.
              </p>
              <button
                onClick={() => navigate('/profiles')}
                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-navy-800 to-navy-900 rounded-lg hover:from-navy-700 hover:to-navy-800 transition-all shadow-sm"
              >
                Set Up Profile
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Scheduler Activity Log */}
      {schedulerActivity.length > 0 && (
        <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 p-6 shadow-lg dark:shadow-2xl dark:shadow-black/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-navy-950 dark:text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              Scheduler Activity
            </h2>
            <button
              onClick={() => navigate('/activity')}
              className="text-xs font-medium text-navy-700 dark:text-emerald-400 hover:text-navy-900 dark:hover:text-emerald-300 flex items-center gap-1 transition-colors"
            >
              View All Logs
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </div>

          <div className="space-y-2">
            {schedulerActivity.map((log) => {
              const isCheck = log.action === 'scheduler_check'
              const isCompleted = log.action === 'scheduler_run_completed'
              const isFailed = log.action === 'scheduler_run_failed'
              const isAutoPaused = log.action === 'scheduler_auto_paused'
              // Operational problems the engine surfaced (why bidding is dead)
              const isProblem = ['openai_stall_detected', 'openai_not_configured', 'token_refresh_failed'].includes(log.action)
              const details = log.details || {}

              return (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 dark:border-white/8 hover:bg-slate-50 dark:hover:bg-navy-700/50 transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    isCheck && details.allowed ? 'bg-emerald-500' :
                    isCheck && !details.allowed ? 'bg-blue-500' :
                    isCompleted ? 'bg-emerald-500' :
                    (isAutoPaused || isProblem) ? 'bg-amber-500' :
                    'bg-red-500'
                  }`} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        {isCheck && (
                          <p className="text-sm font-medium text-navy-950 dark:text-white">
                            {details.allowed ? '✓ Schedule Check Passed' : '⏸ Schedule Check Blocked'}
                          </p>
                        )}
                        {isCompleted && (
                          <p className="text-sm font-medium text-navy-950 dark:text-white">
                            ✓ Growlance Run Completed
                          </p>
                        )}
                        {isFailed && (
                          <p className="text-sm font-medium text-navy-950 dark:text-white">
                            ✗ Growlance Run Failed
                          </p>
                        )}
                        {isAutoPaused && (
                          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                            ⏸ Auto-Paused — All Profiles Deactivated
                          </p>
                        )}
                        {isProblem && (
                          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                            ⚠ {log.action === 'openai_not_configured' ? 'OpenAI Not Configured'
                              : log.action === 'token_refresh_failed' ? 'Freelancer Connection Expired'
                              : 'OpenAI Stall Detected'}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                          <span>{timeAgo(log.createdAt)}</span>

                          {isCheck && !details.allowed && (
                            <span className="text-blue-600 dark:text-blue-400">
                              {details.reason}
                            </span>
                          )}

                          {isCompleted && details.results && (
                            <>
                              <span className="inline-flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                                </svg>
                                {details.profileCount} profile{details.profileCount !== 1 ? 's' : ''}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                                </svg>
                                {details.results.searched} searched
                              </span>
                              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                </svg>
                                {details.results.placed} bids placed
                              </span>
                              {details.results.queued > 0 && (
                                <span className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400 font-medium">
                                  {details.results.queued} queued for review
                                </span>
                              )}
                              <span className="text-slate-400">
                                {details.durationMs}ms
                              </span>
                            </>
                          )}

                          {isFailed && details.error && (
                            <span className="text-red-600 dark:text-red-400">
                              {details.error}
                            </span>
                          )}

                          {(isAutoPaused || isProblem) && (
                            <span className="text-amber-700 dark:text-amber-400">
                              {details.message || details.reason || ''}
                              {details.suggestion ? ` ${details.suggestion}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/8">
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              Showing recent scheduler activity. Check logs are recorded every minute when scheduler is running.
            </p>
          </div>
        </div>
      )}

      {/* Quick Actions Panel */}
      <div className="bg-gradient-to-br from-navy-900 to-navy-950 dark:from-navy-700 dark:to-navy-800 rounded-xl p-6 shadow-xl shadow-navy-900/50 dark:shadow-black/50 border border-navy-800 dark:border-white/6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
          </svg>
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() => navigate('/projects')}
            className="group flex flex-col items-center gap-2 p-4 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 hover:border-emerald-400/50 transition-all duration-200"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-white">Find Projects</span>
          </button>

          <button
            onClick={async () => {
              setRunningBidder(true)
              setRunBidderMessage(null)
              try {
                await api.post('/scheduler/trigger')
                setRunBidderMessage({ type: 'success', text: 'Run triggered — results will appear in the activity feed below.' })
                setTimeout(() => setRunBidderMessage(null), 6000)
              } catch (err) {
                setRunBidderMessage({ type: 'error', text: err.response?.data?.error || 'Failed to trigger a run.' })
              } finally {
                setRunningBidder(false)
              }
            }}
            disabled={runningBidder || !freelancer.connected || stats?.activeProfiles === 0}
            title={!freelancer.connected ? 'Connect your Freelancer account first (Settings)'
              : stats?.activeProfiles === 0 ? 'Activate a bidding profile first'
              : 'Trigger an auto-bid run now'}
            className="group flex flex-col items-center gap-2 p-4 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 hover:border-emerald-400/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
              {runningBidder ? (
                <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                </svg>
              )}
            </div>
            <span className="text-sm font-medium text-white">{runningBidder ? 'Triggering...' : 'Run Bidder'}</span>
          </button>

          <button
            onClick={() => navigate('/bids')}
            className="group flex flex-col items-center gap-2 p-4 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 hover:border-blue-400/50 transition-all duration-200"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-white">View All Bids</span>
          </button>

          <button
            onClick={() => navigate('/profiles')}
            className="group flex flex-col items-center gap-2 p-4 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 hover:border-purple-400/50 transition-all duration-200"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-white">Manage Profiles</span>
          </button>
        </div>
        {runBidderMessage && (
          <p className={`mt-3 text-sm font-medium ${
            runBidderMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {runBidderMessage.text}
          </p>
        )}
      </div>
    </div>
  )
}
