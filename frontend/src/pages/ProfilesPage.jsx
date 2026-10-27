import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfiles } from '../hooks/useProfiles'
import { useConfirm } from '../components/ConfirmDialog'
import SharedSettingsCard from '../components/Profiles/SharedSettingsCard'

const STRATEGY_LABELS = {
  auto: 'AI Auto',
  fixed: 'Fixed',
  percentage: '% of Budget',
}

const REGION_LABELS = {
  north_america: 'North America', central_america: 'Central America',
  caribbean: 'Caribbean', south_america: 'South America',
  western_europe: 'Western Europe', northern_europe: 'Northern Europe',
  southern_europe: 'Southern Europe', eastern_europe: 'Eastern Europe',
  north_africa: 'North Africa', west_africa: 'West Africa',
  east_africa: 'East Africa', central_africa: 'Central Africa', southern_africa: 'Southern Africa',
  middle_east: 'Middle East', central_asia: 'Central Asia',
  south_asia: 'South Asia', southeast_asia: 'Southeast Asia', east_asia: 'East Asia',
  australia_nz: 'Australia & NZ', pacific_islands: 'Pacific Islands',
}

const _regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
function countryFlag(code) {
  if (!code || code.length !== 2) return ''
  return String.fromCodePoint(0x1F1E6 - 65 + code.charCodeAt(0), 0x1F1E6 - 65 + code.charCodeAt(1))
}
function countryName(code) {
  try { return _regionNames.of(code) || code } catch { return code }
}

export default function ProfilesPage() {
  const { profiles, loading, error, fetchProfiles, remove, duplicate, activate, deactivate } = useProfiles()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [togglingId, setTogglingId] = useState(null)
  const [duplicatingId, setDuplicatingId] = useState(null)
  const [actionError, setActionError] = useState(null)

  useEffect(() => {
    fetchProfiles()
  }, [])

  async function handleToggle(profile) {
    setTogglingId(profile.id)
    setActionError(null)
    try {
      if (profile.isActive) {
        await deactivate(profile.id)
      } else {
        await activate(profile.id)
      }
    } catch (err) {
      // The hook only surfaces fetch errors — action failures land here, and
      // silently reverting the core toggle of the product is not an option.
      setActionError(err.response?.data?.error || `Failed to ${profile.isActive ? 'deactivate' : 'activate'} "${profile.name}".`)
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDuplicate(profile) {
    setDuplicatingId(profile.id)
    setActionError(null)
    try {
      await duplicate(profile.id)
    } catch (err) {
      setActionError(err.response?.data?.error || `Failed to duplicate "${profile.name}".`)
    } finally {
      setDuplicatingId(null)
    }
  }

  async function handleDelete(profile) {
    const confirmed = await confirm({
      title: 'Delete Profile',
      message: `Delete profile "${profile.name}"? This cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger'
    })
    if (!confirmed) return
    setActionError(null)
    try {
      await remove(profile.id)
    } catch (err) {
      setActionError(err.response?.data?.error || `Failed to delete "${profile.name}".`)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-950 dark:text-white">Bid Profiles</h1>
          <p className="text-sm text-slate-700 dark:text-slate-200 mt-1">
            Create bid profiles to define what types of projects to target and how to bid on them.
          </p>
        </div>
        <button
          onClick={() => navigate('/profiles/new')}
          className="px-4 py-2 bg-navy-900 dark:bg-emerald-400 text-white dark:text-navy-950 text-sm font-medium rounded-lg hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors shadow-sm"
        >
          New Profile
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}
      {actionError && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">{actionError}</div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-navy-900 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-700 dark:text-slate-200">Loading profiles...</p>
          </div>
        </div>
      )}

      {/* Settings applied to every profile */}
      {!loading && <SharedSettingsCard />}

      {/* Profile Cards */}
      {!loading && profiles.length > 0 && (
        <div className="space-y-5">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="bg-white dark:bg-navy-800/90 rounded-xl shadow-lg dark:shadow-2xl dark:shadow-black/50 border border-slate-200 dark:border-white/6 overflow-hidden"
            >
              {/* ── Header ─────────────────────────────────────────── */}
              <div className="px-4 py-2.5 flex items-center justify-between gap-3 bg-slate-50 dark:bg-navy-900/40 border-b border-slate-100 dark:border-white/8">
                <div className="flex items-center gap-2.5 min-w-0">
                  <h3 className="text-sm font-bold text-navy-950 dark:text-white truncate">{profile.name}</h3>
                  {profile.bidCount > 0 && (
                    <span className="shrink-0 text-xs font-medium text-navy-600 dark:text-emerald-400 bg-navy-50 dark:bg-navy-700 px-2 py-0.5 rounded-full">
                      {profile.bidCount} bids
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleToggle(profile)}
                    disabled={togglingId === profile.id}
                    className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border transition-colors ${
                      profile.isActive
                        ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/60'
                        : 'bg-white dark:bg-navy-800 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-700'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${profile.isActive ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-500'}`} />
                    {togglingId === profile.id ? '...' : profile.isActive ? 'Active' : 'Inactive'}
                  </button>
                  <button onClick={() => navigate(`/profiles/${profile.id}/edit`)} className="px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-navy-700 border border-slate-200 dark:border-white/10 rounded-md hover:bg-slate-50 dark:hover:bg-navy-600 transition-colors">Edit</button>
                  <button onClick={() => handleDuplicate(profile)} disabled={duplicatingId === profile.id} className="px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-navy-700 border border-slate-200 dark:border-white/10 rounded-md hover:bg-slate-50 dark:hover:bg-navy-600 transition-colors disabled:opacity-50">{duplicatingId === profile.id ? '...' : 'Duplicate'}</button>
                  <button onClick={() => handleDelete(profile)} className="px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors">Delete</button>
                </div>
              </div>

              {/* ── Performance ────────────────────────────────────── */}
              {profile.stats?.total > 0 && (
                <div className="px-4 py-2 flex flex-wrap items-center gap-x-5 gap-y-1 bg-emerald-50/40 dark:bg-emerald-900/10 border-b border-slate-100 dark:border-white/8 text-xs">
                  <div className="flex items-baseline gap-1">
                    <span className="font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Delivered</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{profile.stats.delivered}</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Converted</span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">{profile.stats.converted}</span>
                  </div>
                  <div className="flex items-baseline gap-1" title="Converted (client replied) ÷ delivered bids">
                    <span className="font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Conv. rate</span>
                    <span className={`font-bold ${
                      profile.stats.conversionRate === null ? 'text-slate-400 dark:text-slate-500'
                        : profile.stats.conversionRate >= 20 ? 'text-emerald-700 dark:text-emerald-400'
                        : profile.stats.conversionRate >= 10 ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}>
                      {profile.stats.conversionRate === null ? '—' : `${profile.stats.conversionRate}%`}
                    </span>
                  </div>
                  {profile.stats.pendingReview > 0 && (
                    <div className="flex items-baseline gap-1">
                      <span className="font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Needs review</span>
                      <span className="font-semibold text-violet-700 dark:text-violet-400">{profile.stats.pendingReview}</span>
                    </div>
                  )}
                  {profile.stats.error > 0 && (
                    <div className="flex items-baseline gap-1">
                      <span className="font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Errors</span>
                      <span className="font-semibold text-red-600 dark:text-red-400">{profile.stats.error}</span>
                    </div>
                  )}
                  <button
                    onClick={() => navigate('/bids')}
                    className="ml-auto text-emerald-700 dark:text-emerald-400 font-medium hover:underline"
                  >
                    View bids →
                  </button>
                </div>
              )}

              {/* ── Body ───────────────────────────────────────────── */}
              <div className="px-4 py-3 space-y-2.5">

                {/* Row 1: Search + Bidding params */}
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Keywords</span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">{profile.searchKeywords || <span className="text-slate-400 dark:text-slate-600 italic">Any</span>}</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Type</span>
                    <span className="font-medium text-slate-700 dark:text-slate-200 capitalize">{profile.projectTypes === 'both' ? 'Fixed+Hourly' : profile.projectTypes || 'Both'}</span>
                  </div>
                  {profile.languages && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Lang</span>
                      <span className="font-medium text-slate-700 dark:text-slate-200">{profile.languages}</span>
                    </div>
                  )}
                  {(profile.budgetMinFixed != null || profile.budgetMaxFixed != null) && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Fixed $</span>
                      <span className="font-medium text-slate-700 dark:text-slate-200">${profile.budgetMinFixed ?? '–'}–${profile.budgetMaxFixed ?? '∞'}</span>
                    </div>
                  )}
                  {(profile.budgetMinHourly != null || profile.budgetMaxHourly != null) && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Hourly $</span>
                      <span className="font-medium text-slate-700 dark:text-slate-200">${profile.budgetMinHourly ?? '–'}–${profile.budgetMaxHourly ?? '∞'}/hr</span>
                    </div>
                  )}
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Bid</span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {STRATEGY_LABELS[profile.bidAmountStrategy] || profile.bidAmountStrategy}
                      {profile.bidAmountStrategy === 'fixed' && profile.fixedBidAmount && <span> ${profile.fixedBidAmount}</span>}
                      {profile.bidAmountStrategy === 'percentage' && profile.bidPercentage && <span> {profile.bidPercentage}%</span>}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Delivery</span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {profile.periodDaysStrategy === 'ai' ? 'AI' : `${profile.defaultPeriodDays}d`}
                      {profile.milestonePercentage != null && <span className="text-slate-400 dark:text-slate-500"> · {profile.milestonePercentage}%</span>}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">AI Score</span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">≥{profile.minRelevanceScore}%</span>
                  </div>
                </div>

                {/* Row 2: Targeting pills */}
                {(
                  (Array.isArray(profile.countries) && profile.countries.length > 0) ||
                  (Array.isArray(profile.excludedRegions) && profile.excludedRegions.length > 0) ||
                  (Array.isArray(profile.excludedCountries) && profile.excludedCountries.length > 0)
                ) && (
                  <div className="border-t border-slate-100 dark:border-white/8 pt-2 space-y-1.5">
                    {Array.isArray(profile.countries) && profile.countries.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide shrink-0 w-36">Only</span>
                        {profile.countries.map(c => (
                          <span key={c} className="inline-flex items-center gap-0.5 text-xs font-medium bg-slate-100 dark:bg-navy-700/60 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 pl-1 pr-1.5 py-px rounded-full">
                            <span className="leading-none">{countryFlag(c)}</span>{c}
                          </span>
                        ))}
                      </div>
                    )}
                    {Array.isArray(profile.excludedRegions) && profile.excludedRegions.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide shrink-0 w-36">Excluded regions</span>
                        {profile.excludedRegions.map(r => (
                          <span key={r} className="text-xs font-medium bg-slate-100 dark:bg-navy-700/60 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 px-1.5 py-px rounded-full">
                            {REGION_LABELS[r] || r}
                          </span>
                        ))}
                      </div>
                    )}
                    {Array.isArray(profile.countryExceptions) && profile.countryExceptions.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide shrink-0 w-36">Exceptions</span>
                        {profile.countryExceptions.map(c => (
                          <span key={c} className="inline-flex items-center gap-0.5 text-xs font-medium bg-slate-100 dark:bg-navy-700/60 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 pl-1 pr-1.5 py-px rounded-full">
                            <span className="leading-none">{countryFlag(c)}</span>{c}
                          </span>
                        ))}
                      </div>
                    )}
                    {Array.isArray(profile.excludedCountries) && profile.excludedCountries.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide shrink-0 w-36">Excluded countries</span>
                        {profile.excludedCountries.map(c => (
                          <span key={c} className="inline-flex items-center gap-0.5 text-xs font-medium bg-slate-100 dark:bg-navy-700/60 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 pl-1 pr-1.5 py-px rounded-full">
                            <span className="leading-none">{countryFlag(c)}</span>{c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Row 3: Context text (1-line each) */}
                {(profile.proposalPrompt || profile.skillsSummary || profile.experienceSummary || profile.portfolioHighlights) && (
                  <div className="border-t border-slate-100 dark:border-white/8 pt-2 space-y-1">
                    {profile.proposalPrompt && (
                      <div className="flex items-baseline gap-1.5 text-xs min-w-0">
                        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide shrink-0">Prompt</span>
                        <span className="text-slate-500 dark:text-slate-400 truncate">{profile.proposalPrompt.replace(/\s+/g, ' ').trim()}</span>
                      </div>
                    )}
                    {profile.skillsSummary && (
                      <div className="flex items-baseline gap-1.5 text-xs min-w-0">
                        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide shrink-0">Skills</span>
                        <span className="text-slate-500 dark:text-slate-400 truncate">{profile.skillsSummary.replace(/\s+/g, ' ').trim()}</span>
                      </div>
                    )}
                    {profile.experienceSummary && (
                      <div className="flex items-baseline gap-1.5 text-xs min-w-0">
                        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide shrink-0">Experience</span>
                        <span className="text-slate-500 dark:text-slate-400 truncate">{profile.experienceSummary.replace(/\s+/g, ' ').trim()}</span>
                      </div>
                    )}
                    {profile.portfolioHighlights && (
                      <div className="flex items-baseline gap-1.5 text-xs min-w-0">
                        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide shrink-0">Portfolio</span>
                        <span className="text-slate-500 dark:text-slate-400 truncate">{profile.portfolioHighlights.replace(/\s+/g, ' ').trim()}</span>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && profiles.length === 0 && !error && (
        <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50">
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-navy-700 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-navy-950 dark:text-white mb-1">No bid profiles yet</h3>
            <p className="text-sm text-slate-700 dark:text-slate-200 text-center max-w-sm mb-4">
              Bid profiles define search criteria, budget ranges, and AI settings for automatic bidding.
            </p>
            <button
              onClick={() => navigate('/profiles/new')}
              className="px-4 py-2 bg-navy-900 dark:bg-emerald-400 text-white dark:text-navy-950 text-sm font-medium rounded-lg hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors shadow-sm"
            >
              Create Your First Profile
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
