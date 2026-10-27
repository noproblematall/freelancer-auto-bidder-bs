import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useProjects } from '../hooks/useProjects'
import { timeAgo, formatBudget } from '../utils/formatters'
import ProjectDetailModal from '../components/Projects/ProjectDetailModal'
import api from '../services/api'

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

function getDetailedSkipReason(project, activeProfiles, userBids) {
  // Determine detailed reason why a project wasn't analyzed by AI
  if (!project.aiAnalysis) {
    const now = new Date()
    const discoveredAt = new Date(project.discoveredAt || project.lastCheckedAt)
    const minutesSinceDiscovery = (now - discoveredAt) / (1000 * 60)

    // Check if recently discovered (within last 2 minutes)
    if (minutesSinceDiscovery < 2) {
      return { text: 'Pending Analysis', tooltip: 'Recently discovered - waiting for next Growlance run' }
    }

    // Check if user already bid on this project
    const existingBid = userBids.find(bid => bid.projectId === project.id)
    if (existingBid) {
      const statusText = existingBid.status === 'placed' ? 'placed'
        : existingBid.status === 'retracted' ? 'retracted'
        : existingBid.status === 'error' ? 'failed'
        : existingBid.status
      return { text: 'Already Bid', tooltip: `You already ${statusText} a bid on this project` }
    }

    // Check against active profile filters
    if (activeProfiles.length === 0) {
      return { text: 'No Active Profiles', tooltip: 'No active bidding profiles to analyze this project' }
    }

    // Check excluded countries for all active profiles
    for (const profile of activeProfiles) {
      if (profile.excludedCountries && project.ownerCountry) {
        try {
          const excluded = JSON.parse(profile.excludedCountries)
          if (Array.isArray(excluded) && excluded.some(c => c.toUpperCase() === project.ownerCountry.toUpperCase())) {
            return { text: `Excluded: ${project.ownerCountry}`, tooltip: `Project owner from excluded country (${project.ownerCountry})` }
          }
        } catch {}
      }
    }

    // Check budget filters for fixed-price projects
    if (project.projectType === 'fixed') {
      for (const profile of activeProfiles) {
        if (profile.budgetMinFixed && project.budgetMax && project.budgetMax < profile.budgetMinFixed) {
          return { text: 'Budget Too Low', tooltip: `Max budget $${project.budgetMax} < profile minimum $${profile.budgetMinFixed}` }
        }
        if (profile.budgetMaxFixed && project.budgetMin && project.budgetMin > profile.budgetMaxFixed) {
          return { text: 'Budget Too High', tooltip: `Min budget $${project.budgetMin} > profile maximum $${profile.budgetMaxFixed}` }
        }
      }
    }

    // Check budget filters for hourly projects
    if (project.projectType === 'hourly') {
      for (const profile of activeProfiles) {
        if (profile.budgetMinHourly && project.budgetMax && project.budgetMax < profile.budgetMinHourly) {
          return { text: 'Rate Too Low', tooltip: `Max rate $${project.budgetMax}/hr < profile minimum $${profile.budgetMinHourly}/hr` }
        }
        if (profile.budgetMaxHourly && project.budgetMin && project.budgetMin > profile.budgetMaxHourly) {
          return { text: 'Rate Too High', tooltip: `Min rate $${project.budgetMin}/hr > profile maximum $${profile.budgetMaxHourly}/hr` }
        }
      }
    }

    // Check if very old without analysis
    const daysSinceDiscovery = (now - discoveredAt) / (1000 * 60 * 60 * 24)
    if (daysSinceDiscovery > 1) {
      return { text: 'Skipped', tooltip: 'Not analyzed - may not match profile keywords or other criteria' }
    }

    // Default: waiting for analysis
    return { text: 'Not Analyzed', tooltip: 'Waiting for Growlance to analyze this project' }
  }
  return null
}

export default function ProjectsPage() {
  const { freelancer } = useAuth()
  const { projects, totalCount, loading, searching, error, fetchProjects, searchFreelancer, updateProject } = useProjects()

  const [query, setQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [minBudget, setMinBudget] = useState('')
  const [maxBudget, setMaxBudget] = useState('')
  const [projectType, setProjectType] = useState('both')
  const [sortBy, setSortBy] = useState('discoveredAt')
  const [offset, setOffset] = useState(0)
  const [selectedProject, setSelectedProject] = useState(null)

  // Fetch active profiles and bids for detailed skip reasons
  const [activeProfiles, setActiveProfiles] = useState([])
  const [userBids, setUserBids] = useState([])

  // Load profiles and bids for computing skip reasons
  useEffect(() => {
    async function loadFilterData() {
      try {
        const [profilesRes, bidsRes] = await Promise.all([
          api.get('/profiles'),
          // High limit: "Already Bid" badges are computed from this list — the
          // default 20 rows made older bids invisible to the check.
          api.get('/bids', { params: { limit: 1000 } })
        ])
        setActiveProfiles(profilesRes.data.profiles?.filter(p => p.isActive) || [])
        setUserBids(bidsRes.data.bids || [])
      } catch (err) {
        // Silent fail - skip reasons will fall back to generic messages
      }
    }
    loadFilterData()
  }, [])

  // Build local DB query params from current filter state
  function buildLocalParams(overrideOffset) {
    const params = { limit: LIMIT, offset: overrideOffset ?? offset, sortBy, sortOrder: 'desc' }
    if (query.trim()) params.search = query.trim()
    if (projectType !== 'both') params.projectType = projectType
    if (minBudget) params.minBudget = minBudget
    if (maxBudget) params.maxBudget = maxBudget
    return params
  }

  // Load from local DB on mount
  useEffect(() => {
    fetchProjects(buildLocalParams(0))
  }, [])

  // Auto-refresh from local DB when sort/filter changes
  useEffect(() => {
    setOffset(0)
    fetchProjects(buildLocalParams(0))
  }, [sortBy, projectType])

  function handleSearch(e) {
    e.preventDefault()
    setOffset(0)
    const filters = { query: query.trim(), limit: LIMIT, offset: 0 }
    if (minBudget) filters.minBudget = parseFloat(minBudget)
    if (maxBudget) filters.maxBudget = parseFloat(maxBudget)
    if (projectType !== 'both') filters.projectTypes = [projectType]
    // Hit Freelancer API to discover + upsert new projects, then refresh
    // the local view so pagination, sort, and filters all work consistently.
    searchFreelancer(filters)
      .then(() => fetchProjects(buildLocalParams(0)))
      .catch(() => {})
  }

  function handlePrev() {
    const newOffset = Math.max(0, offset - LIMIT)
    setOffset(newOffset)
    fetchProjects(buildLocalParams(newOffset))
  }

  function handleNext() {
    const newOffset = offset + LIMIT
    setOffset(newOffset)
    fetchProjects(buildLocalParams(newOffset))
  }

  // Not connected state
  if (!freelancer.connected) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Freelancer account not connected</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Connect your Freelancer.com account before searching for projects.</p>
            </div>
            <Link to="/settings" className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors">
              Open Settings
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-950 dark:text-white">Projects</h1>
        <p className="text-sm text-slate-700 dark:text-slate-200 mt-1">Browse and search projects from Freelancer.com</p>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50 overflow-hidden">
        <form onSubmit={handleSearch} className="px-5 py-4">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects (e.g. React, Shopify, WordPress)..."
                className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-colors placeholder:text-slate-400"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="px-5 py-2.5 bg-navy-900 dark:bg-emerald-400 text-white dark:text-navy-950 text-sm font-medium rounded-lg hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-50 whitespace-nowrap"
            >
              {searching ? 'Searching...' : 'Search Freelancer'}
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                showFilters
                  ? 'bg-navy-50 dark:bg-navy-700 border-navy-200 dark:border-white/12 text-navy-700 dark:text-emerald-400'
                  : 'bg-white dark:bg-navy-900 border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-navy-500'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
              </svg>
            </button>
          </div>

          {/* Expandable Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/8 grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">Min Budget</label>
                <input
                  type="number"
                  value={minBudget}
                  onChange={(e) => setMinBudget(e.target.value)}
                  placeholder="$0"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 placeholder:text-slate-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">Max Budget</label>
                <input
                  type="number"
                  value={maxBudget}
                  onChange={(e) => setMaxBudget(e.target.value)}
                  placeholder="No limit"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 placeholder:text-slate-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">Project Type</label>
                <div className="flex gap-1">
                  {['both', 'fixed', 'hourly'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setProjectType(t)}
                      className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                        projectType === t
                          ? 'bg-navy-900 dark:bg-emerald-400 text-white dark:text-navy-950'
                          : 'bg-slate-100 dark:bg-navy-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-navy-600'
                      }`}
                    >
                      {t === 'both' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 bg-white dark:bg-navy-900 dark:text-white"
                >
                  <option value="discoveredAt">Newest First</option>
                  <option value="budgetMax">Highest Budget</option>
                  <option value="bidCount">Fewest Bids</option>
                  <option value="timeSubmitted">Recently Posted</option>
                  <option value="relevanceScore">Relevance Score</option>
                </select>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {(loading || searching) && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-navy-900 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-700 dark:text-slate-400">{searching ? 'Searching Freelancer.com...' : 'Loading projects...'}</p>
          </div>
        </div>
      )}

      {/* Project List */}
      {!loading && !searching && projects.length > 0 && (
        <>
          <div className="space-y-3">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => setSelectedProject(project)}
                className="w-full text-left bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50 hover:shadow-xl dark:hover:shadow-2xl dark:hover:shadow-black/60 hover:border-slate-300 dark:hover:border-navy-500 transition-all p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="text-sm font-semibold text-navy-950 dark:text-white truncate">{project.title}</h3>
                      {project.projectType && (
                        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                          project.projectType === 'fixed'
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                            : 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                        }`}>
                          {project.projectType === 'fixed' ? 'Fixed' : 'Hourly'}
                        </span>
                      )}
                    </div>
                    {project.description && (
                      <p className="text-sm text-slate-700 dark:text-slate-200 line-clamp-2 mb-3">{project.description.replace(/\s+/g, ' ').trim()}</p>
                    )}
                    <div className="flex items-center gap-3 flex-wrap">
                      {project.jobNames?.length > 0
                        ? project.jobNames.map((job) => (
                            <span key={job.id} className="text-xs font-medium bg-navy-50 dark:bg-navy-700/50 text-navy-700 dark:text-navy-300 px-2 py-0.5 rounded-full">
                              {job.name}
                            </span>
                          ))
                        : null
                      }
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-emerald-500">
                      {formatBudget(project.budgetMin, project.budgetMax, project.currency)}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400 justify-end flex-wrap">
                      {project.relevanceScore != null ? (
                        <span className={`font-medium px-1.5 py-0.5 rounded ${
                          project.relevanceScore >= 70
                            ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                            : project.relevanceScore >= 40
                              ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                              : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                        }`}>
                          {project.relevanceScore}%
                        </span>
                      ) : (() => {
                        const skipReason = getDetailedSkipReason(project, activeProfiles, userBids)
                        return (
                          <span
                            className="font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400"
                            title={skipReason?.tooltip}
                          >
                            {skipReason?.text}
                          </span>
                        )
                      })()}
                      {(() => {
                        const ci = getCountryInfo(project.ownerCountry)
                        return ci ? (
                          <span className="flex items-center gap-1">
                            <span className="text-base leading-none">{ci.flag}</span>
                            <span>{ci.name} ({project.ownerCountry})</span>
                          </span>
                        ) : null
                      })()}
                      <span>{project.bidCount} bids</span>
                      <span>{timeAgo(project.timeSubmitted || project.discoveredAt)}</span>
                    </div>
                  </div>
                </div>
              </button>
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
        </>
      )}

      {/* Empty State */}
      {!loading && !searching && projects.length === 0 && !error && (
        <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50">
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-navy-700 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-navy-950 dark:text-white mb-1">No projects yet</h3>
            <p className="text-sm text-slate-700 dark:text-slate-200 text-center max-w-sm">
              Use the search bar above to discover projects from Freelancer.com.
            </p>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <ProjectDetailModal
        project={selectedProject}
        isOpen={!!selectedProject}
        onClose={() => setSelectedProject(null)}
        onProjectUpdated={updateProject}
      />
    </div>
  )
}
