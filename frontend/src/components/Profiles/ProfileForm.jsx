import { useState, useEffect } from 'react'
import CountryMultiSelect from './CountryMultiSelect'
import CurrencyMultiSelect from './CurrencyMultiSelect'

const REGIONS = [
  { group: 'Americas', items: [
    { key: 'north_america', label: 'North America' },
    { key: 'central_america', label: 'Central America' },
    { key: 'caribbean', label: 'Caribbean' },
    { key: 'south_america', label: 'South America' },
  ]},
  { group: 'Europe', items: [
    { key: 'western_europe', label: 'Western Europe' },
    { key: 'northern_europe', label: 'Northern Europe' },
    { key: 'southern_europe', label: 'Southern Europe' },
    { key: 'eastern_europe', label: 'Eastern Europe' },
  ]},
  { group: 'Africa', items: [
    { key: 'north_africa', label: 'North Africa' },
    { key: 'west_africa', label: 'West Africa' },
    { key: 'east_africa', label: 'East Africa' },
    { key: 'central_africa', label: 'Central Africa' },
    { key: 'southern_africa', label: 'Southern Africa' },
  ]},
  { group: 'Asia', items: [
    { key: 'middle_east', label: 'Middle East' },
    { key: 'central_asia', label: 'Central Asia' },
    { key: 'south_asia', label: 'South Asia' },
    { key: 'southeast_asia', label: 'Southeast Asia' },
    { key: 'east_asia', label: 'East Asia' },
  ]},
  { group: 'Oceania', items: [
    { key: 'australia_nz', label: 'Australia & NZ' },
    { key: 'pacific_islands', label: 'Pacific Islands' },
  ]},
]

const INITIAL_STATE = {
  name: '',
  searchKeywords: '',
  jobIds: '',
  budgetMinFixed: '',
  budgetMaxFixed: '',
  budgetMinHourly: '',
  budgetMaxHourly: '',
  projectTypes: 'both',
  countries: [],
  excludedCountries: [],
  excludedRegions: [],
  countryExceptions: [],
  excludedCurrencies: [],
  languages: '',
  bidAmountStrategy: 'auto',
  fixedBidAmount: '',
  fixedHourlyRate: '',
  bidPercentage: '',
  periodDaysStrategy: 'fixed',
  defaultPeriodDays: '7',
  defaultHourlyRate: '',
  minPeriodDays: '',
  maxPeriodDays: '',
  milestonePercentage: '100',
  minRelevanceScore: '70',
  proposalPrompt: '',
  // New profiles start in review-and-send: a first-time user's first activation
  // should queue drafts for approval, not place real bids within 60 seconds.
  // Auto mode is one visible toggle away.
  reviewMode: true,
  maxBidsPerHour: '5',
  maxBidsPerDay: '20',
  skillsSummary: '',
  experienceSummary: '',
  portfolioHighlights: '',
}

export default function ProfileForm({ profile = null, onSave, onCancel, saving = false, error: externalError = null }) {
  const [form, setForm] = useState(INITIAL_STATE)
  const [error, setError] = useState(null)
  const isEdit = !!profile

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name || '',
        searchKeywords: profile.searchKeywords || '',
        jobIds: profile.jobIds || '',
        budgetMinFixed: profile.budgetMinFixed != null ? String(profile.budgetMinFixed) : '',
        budgetMaxFixed: profile.budgetMaxFixed != null ? String(profile.budgetMaxFixed) : '',
        budgetMinHourly: profile.budgetMinHourly != null ? String(profile.budgetMinHourly) : '',
        budgetMaxHourly: profile.budgetMaxHourly != null ? String(profile.budgetMaxHourly) : '',
        projectTypes: profile.projectTypes || 'both',
        countries: Array.isArray(profile.countries) ? profile.countries : [],
        excludedCountries: Array.isArray(profile.excludedCountries) ? profile.excludedCountries : [],
        excludedRegions: Array.isArray(profile.excludedRegions) ? profile.excludedRegions : [],
        countryExceptions: Array.isArray(profile.countryExceptions) ? profile.countryExceptions : [],
        excludedCurrencies: Array.isArray(profile.excludedCurrencies) ? profile.excludedCurrencies : [],
        languages: profile.languages || '',
        bidAmountStrategy: profile.bidAmountStrategy || 'auto',
        fixedBidAmount: profile.fixedBidAmount != null ? String(profile.fixedBidAmount) : '',
        fixedHourlyRate: profile.fixedHourlyRate != null ? String(profile.fixedHourlyRate) : '',
        bidPercentage: profile.bidPercentage != null ? String(profile.bidPercentage) : '',
        periodDaysStrategy: profile.periodDaysStrategy || 'fixed',
        defaultPeriodDays: String(profile.defaultPeriodDays ?? 7),
        defaultHourlyRate: profile.defaultHourlyRate != null ? String(profile.defaultHourlyRate) : '',
        minPeriodDays: profile.minPeriodDays != null ? String(profile.minPeriodDays) : '',
        maxPeriodDays: profile.maxPeriodDays != null ? String(profile.maxPeriodDays) : '',
        milestonePercentage: String(profile.milestonePercentage ?? 100),
        minRelevanceScore: String(profile.minRelevanceScore ?? 70),
        proposalPrompt: profile.proposalPrompt || '',
        reviewMode: !!profile.reviewMode,
        maxBidsPerHour: String(profile.maxBidsPerHour ?? 5),
        maxBidsPerDay: String(profile.maxBidsPerDay ?? 20),
        skillsSummary: profile.skillsSummary || '',
        experienceSummary: profile.experienceSummary || '',
        portfolioHighlights: profile.portfolioHighlights || '',
      })
    } else {
      setForm(INITIAL_STATE)
    }
    setError(null)
  }, [profile?.id])

  function set(field) {
    return (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  // The error banner renders at the top of a very long form while the submit
  // button sits at the bottom — without scrolling, a failed click looks like
  // the button did nothing.
  function fail(message) {
    setError(message)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!form.name.trim()) return fail('Profile name is required.')
    if (form.bidAmountStrategy === 'fixed' && !form.fixedBidAmount) return fail('Fixed bid amount is required.')
    if (form.bidAmountStrategy === 'percentage' && !form.bidPercentage) return fail('Bid percentage is required.')
    if (form.budgetMinFixed && form.budgetMaxFixed && parseFloat(form.budgetMinFixed) > parseFloat(form.budgetMaxFixed)) {
      return fail('Fixed-price minimum budget cannot be greater than maximum.')
    }
    if (form.budgetMinHourly && form.budgetMaxHourly && parseFloat(form.budgetMinHourly) > parseFloat(form.budgetMaxHourly)) {
      return fail('Hourly minimum budget cannot be greater than maximum.')
    }

    try {
      await onSave(form)
    } catch (err) {
      fail(err.response?.data?.error || 'Failed to save profile')
    }
  }

  const inputClass = "w-full px-3 py-2 text-sm border border-slate-300 dark:border-white/10 rounded-lg bg-white dark:bg-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 placeholder:text-slate-400 dark:placeholder:text-slate-600"
  const labelClass = "block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5"
  const sectionLabel = "text-xs font-medium text-navy-800 dark:text-emerald-400 uppercase tracking-wide"
  const card = "bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-sm p-6"

  const displayError = error || externalError

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {displayError && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">{displayError}</div>
      )}

      {/* Basic Info */}
      <div className={card}>
        <p className={`${sectionLabel} mb-4`}>Basic Info</p>
        <label className={labelClass}>Profile Name *</label>
        <input type="text" value={form.name} onChange={set('name')} className={inputClass} placeholder="e.g. React/Node Projects" />
      </div>

      {/* Search Criteria */}
      <div className={card}>
        <p className={`${sectionLabel} mb-4`}>Search Criteria</p>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Keywords (comma-separated)</label>
            <input type="text" value={form.searchKeywords} onChange={set('searchKeywords')} className={inputClass} placeholder="react, node, shopify" />
          </div>
          <div>
            <label className={labelClass}>Job IDs (comma-separated)</label>
            <input type="text" value={form.jobIds} onChange={set('jobIds')} className={inputClass} placeholder="3, 17, 120" />
          </div>
          <div>
            <label className={labelClass}>Project Type</label>
            <div className="flex gap-1">
              {['both', 'fixed', 'hourly'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, projectTypes: t }))}
                  className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                    form.projectTypes === t
                      ? 'bg-navy-900 dark:bg-emerald-400 text-white dark:text-navy-950'
                      : 'bg-slate-100 dark:bg-navy-900 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-navy-800'
                  }`}
                >
                  {t === 'both' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Fixed-Price Budget Range</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={form.budgetMinFixed} onChange={set('budgetMinFixed')} className={inputClass} placeholder="Min ($)" />
                <input type="number" value={form.budgetMaxFixed} onChange={set('budgetMaxFixed')} className={inputClass} placeholder="Max ($)" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Hourly Budget Range ($/hr)</label>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={form.budgetMinHourly} onChange={set('budgetMinHourly')} className={inputClass} placeholder="Min" />
                <input type="number" value={form.budgetMaxHourly} onChange={set('budgetMaxHourly')} className={inputClass} placeholder="Max" />
              </div>
            </div>
          </div>
          <div>
            <label className={labelClass}>Languages (comma-separated)</label>
            <input type="text" value={form.languages} onChange={set('languages')} className={inputClass} placeholder="en" />
          </div>
        </div>
      </div>

      {/* Targeting */}
      <div className={card}>
        <p className={`${sectionLabel} mb-4`}>Targeting</p>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Only include countries (allowlist)</label>
            <CountryMultiSelect
              value={form.countries}
              onChange={val => setForm(prev => ({ ...prev, countries: val }))}
              placeholder="Search countries to include..."
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Leave empty to allow all countries</p>
          </div>
          <div>
            <label className={labelClass}>Exclude regions</label>
            <div className="space-y-3">
              {REGIONS.map(group => (
                <div key={group.group}>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">{group.group}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map(region => {
                      const active = form.excludedRegions.includes(region.key)
                      return (
                        <button
                          key={region.key}
                          type="button"
                          onClick={() => setForm(prev => ({
                            ...prev,
                            excludedRegions: active
                              ? prev.excludedRegions.filter(r => r !== region.key)
                              : [...prev.excludedRegions, region.key],
                          }))}
                          className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                            active
                              ? 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-400'
                              : 'bg-white dark:bg-navy-900 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-navy-500'
                          }`}
                        >
                          {region.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {form.excludedRegions.length > 0 && (
            <div>
              <label className={labelClass}>Country exceptions <span className="font-normal text-slate-400">(always allowed even if region is excluded)</span></label>
              <CountryMultiSelect
                value={form.countryExceptions}
                onChange={val => setForm(prev => ({ ...prev, countryExceptions: val }))}
                placeholder="Search countries to allow..."
              />
            </div>
          )}
          <div>
            <label className={labelClass}>Exclude specific countries</label>
            <CountryMultiSelect
              value={form.excludedCountries}
              onChange={val => setForm(prev => ({ ...prev, excludedCountries: val }))}
              placeholder="Search countries to block..."
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Block individual countries in addition to any excluded regions</p>
          </div>
          <div>
            <label className={labelClass}>Exclude project currencies</label>
            <CurrencyMultiSelect
              value={form.excludedCurrencies}
              onChange={val => setForm(prev => ({ ...prev, excludedCurrencies: val }))}
              placeholder="Search currencies to block..."
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Useful when a client's billing currency doesn't match their listed country (e.g. INR-denominated projects posted from Canada or the UK)</p>
          </div>
        </div>
      </div>

      {/* Bidding Parameters */}
      <div className={card}>
        <p className={`${sectionLabel} mb-4`}>Bidding Parameters</p>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Bid Amount Strategy</label>
            <div className="flex gap-1">
              {[
                { value: 'auto', label: 'AI Auto' },
                { value: 'fixed', label: 'Fixed Amount' },
                { value: 'percentage', label: '% of Budget' },
              ].map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, bidAmountStrategy: s.value }))}
                  className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                    form.bidAmountStrategy === s.value
                      ? 'bg-navy-900 dark:bg-emerald-400 text-white dark:text-navy-950'
                      : 'bg-slate-100 dark:bg-navy-900 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-navy-800'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {form.bidAmountStrategy === 'fixed' && (
            <div>
              <label className={labelClass}>Fixed Bid Amount (USD)</label>
              <input type="number" value={form.fixedBidAmount} onChange={set('fixedBidAmount')} className={inputClass} placeholder="50" min="1" step="0.01" />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Automatically converted to the project's currency (EUR, GBP, …) at the current exchange rate when bidding.</p>
            </div>
          )}
          {form.bidAmountStrategy === 'percentage' && (
            <div>
              <label className={labelClass}>Bid Percentage (%)</label>
              <input type="number" value={form.bidPercentage} onChange={set('bidPercentage')} className={inputClass} placeholder="80" min="1" max="100" />
            </div>
          )}
          {(form.projectTypes === 'hourly' || form.projectTypes === 'both') && (
            <div>
              <label className={labelClass}>Fixed Hourly Rate (USD/hr)</label>
              <input type="number" value={form.fixedHourlyRate} onChange={set('fixedHourlyRate')} className={inputClass} placeholder="e.g. 60" min="1" step="0.5" />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Always bid this rate regardless of the project's listed range — converted to the project's currency automatically (so $60 becomes ~€55 on a EUR project, not €60). Leave blank to use the bid amount strategy above.</p>
            </div>
          )}
          <div>
            <label className={labelClass}>Delivery Period Strategy</label>
            <div className="flex gap-1">
              {[
                { value: 'fixed', label: 'Fixed' },
                { value: 'ai', label: 'AI-suggested' },
              ].map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, periodDaysStrategy: s.value }))}
                  className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                    form.periodDaysStrategy === s.value
                      ? 'bg-navy-900 dark:bg-emerald-400 text-white dark:text-navy-950'
                      : 'bg-slate-100 dark:bg-navy-900 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-navy-800'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {form.periodDaysStrategy === 'fixed' ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Delivery Period (days)</label>
                <input type="number" value={form.defaultPeriodDays} onChange={set('defaultPeriodDays')} className={inputClass} min="1" />
              </div>
              <div>
                <label className={labelClass}>Milestone %</label>
                <input type="number" value={form.milestonePercentage} onChange={set('milestonePercentage')} className={inputClass} min="0" max="100" />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Period = <span className="font-medium">budget ÷ (8 × rate)</span> at 90% weight + AI estimate at 10%, then clamped to your bounds.
              </p>
              <div>
                <label className={labelClass}>Your Hourly Rate (USD/hr)</label>
                <input type="number" value={form.defaultHourlyRate} onChange={set('defaultHourlyRate')} className={inputClass} min="1" step="0.5" placeholder="e.g. 50" />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Used in budget ÷ (8 × rate) to estimate days, and as your hourly bid on hourly projects — converted to the project's currency automatically.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Min Days</label>
                  <input type="number" value={form.minPeriodDays} onChange={set('minPeriodDays')} className={inputClass} min="1" placeholder="e.g. 1" />
                </div>
                <div>
                  <label className={labelClass}>Max Days</label>
                  <input type="number" value={form.maxPeriodDays} onChange={set('maxPeriodDays')} className={inputClass} min="1" placeholder="e.g. 14" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Fallback (days)</label>
                  <input type="number" value={form.defaultPeriodDays} onChange={set('defaultPeriodDays')} className={inputClass} min="1" />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">When neither formula nor AI can estimate</p>
                </div>
                <div>
                  <label className={labelClass}>Milestone %</label>
                  <input type="number" value={form.milestonePercentage} onChange={set('milestonePercentage')} className={inputClass} min="0" max="100" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Settings */}
      <div className={card}>
        <p className={`${sectionLabel} mb-4`}>AI Settings</p>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Min Relevance Score (0–100)</label>
            <input type="number" value={form.minRelevanceScore} onChange={set('minRelevanceScore')} className={inputClass} min="0" max="100" />
          </div>
          <div>
            <label className={labelClass}>Custom Proposal Prompt</label>
            <textarea value={form.proposalPrompt} onChange={set('proposalPrompt')} rows={5} className={inputClass} placeholder="Leave blank to use the default prompt from ChatGPT-prompt.md" />
          </div>
          <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-navy-900/50 border border-slate-200 dark:border-white/8">
            <div>
              <p className="text-sm font-medium text-navy-950 dark:text-white">Review before sending</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {form.reviewMode
                  ? 'Drafts are queued on the Bids page for you to edit and approve — nothing is sent automatically'
                  : 'Qualified bids are placed automatically (within your caps and schedule)'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm(prev => ({ ...prev, reviewMode: !prev.reviewMode }))}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                form.reviewMode ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-navy-700'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                form.reviewMode ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>
      </div>

      {/* Rate Limits */}
      <div className={card}>
        <p className={`${sectionLabel} mb-4`}>Rate Limits</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Max Bids / Hour</label>
            <input type="number" value={form.maxBidsPerHour} onChange={set('maxBidsPerHour')} className={inputClass} min="1" />
          </div>
          <div>
            <label className={labelClass}>Max Bids / Day</label>
            <input type="number" value={form.maxBidsPerDay} onChange={set('maxBidsPerDay')} className={inputClass} min="1" />
          </div>
        </div>
      </div>

      {/* Freelancer Profile Context */}
      <div className={card}>
        <p className={`${sectionLabel} mb-4`}>Freelancer Profile (for AI context)</p>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Skills Summary</label>
            <textarea value={form.skillsSummary} onChange={set('skillsSummary')} rows={3} className={inputClass} placeholder="Senior full-stack developer, 10 years React/Node..." />
          </div>
          <div>
            <label className={labelClass}>Experience Summary</label>
            <textarea value={form.experienceSummary} onChange={set('experienceSummary')} rows={3} className={inputClass} placeholder="Describe your past work and expertise..." />
          </div>
          <div>
            <label className={labelClass}>Portfolio Highlights</label>
            <textarea value={form.portfolioHighlights} onChange={set('portfolioHighlights')} rows={3} className={inputClass} placeholder="Notable projects or clients to mention in bids..." />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3 pb-6">
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-navy-800 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 text-sm font-medium text-white dark:text-navy-950 bg-navy-900 dark:bg-emerald-400 rounded-lg hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-50"
        >
          {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Profile'}
        </button>
      </div>
    </form>
  )
}
