import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJobFilters } from '../../services/jobFilters'
import { REGIONS } from './targeting'

const REGION_LABELS = Object.fromEntries(REGIONS.flatMap(g => g.items.map(r => [r.key, r.label])))

function countryFlag(code) {
  if (!code || code.length !== 2) return ''
  return String.fromCodePoint(0x1F1E6 - 65 + code.charCodeAt(0), 0x1F1E6 - 65 + code.charCodeAt(1))
}

function Pill({ children }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium bg-slate-100 dark:bg-navy-700/60 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10 px-1.5 py-px rounded-full">
      {children}
    </span>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide shrink-0 w-36">{label}</span>
      {children}
    </div>
  )
}

/**
 * Summary of the account's job filters, shown above the profile list so it is
 * clear what every profile's search is narrowed by. Self-loading.
 */
export default function JobFiltersCard() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    getJobFilters()
      .then(data => setFilters(data.filters))
      .catch(() => setFailed(true))
  }, [])

  if (failed) return null

  const lists = ['countries', 'excludedRegions', 'countryExceptions', 'excludedCountries', 'excludedCurrencies']
  const hasContent = !!filters && (
    lists.some(k => Array.isArray(filters[k]) && filters[k].length > 0) || !!filters.languages
  )

  return (
    <div className="bg-white dark:bg-navy-800/90 rounded-xl shadow-lg dark:shadow-2xl dark:shadow-black/50 border border-slate-200 dark:border-white/6 overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between gap-3 bg-slate-50 dark:bg-navy-900/40 border-b border-slate-100 dark:border-white/8">
        <div className="flex items-center gap-2.5 min-w-0">
          <svg className="w-4 h-4 text-navy-700 dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
          </svg>
          <h3 className="text-sm font-bold text-navy-950 dark:text-white truncate">Job Filters</h3>
          <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">applied to every profile's search</span>
        </div>
        <button
          onClick={() => navigate('/job-filters')}
          className="shrink-0 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-navy-700 border border-slate-200 dark:border-white/10 rounded-md hover:bg-slate-50 dark:hover:bg-navy-600 transition-colors"
        >
          {hasContent ? 'Edit' : 'Set up'}
        </button>
      </div>

      <div className="px-4 py-3 space-y-1.5">
        {!filters ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">Loading...</p>
        ) : !hasContent ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No filters set. Every profile searches all countries, currencies, and languages.
          </p>
        ) : (
          <>
            {filters.countries.length > 0 && (
              <Row label="Only">
                {filters.countries.map(c => <Pill key={c}><span className="leading-none">{countryFlag(c)}</span>{c}</Pill>)}
              </Row>
            )}
            {filters.excludedRegions.length > 0 && (
              <Row label="Excluded regions">
                {filters.excludedRegions.map(r => <Pill key={r}>{REGION_LABELS[r] || r}</Pill>)}
              </Row>
            )}
            {filters.countryExceptions.length > 0 && (
              <Row label="Exceptions">
                {filters.countryExceptions.map(c => <Pill key={c}><span className="leading-none">{countryFlag(c)}</span>{c}</Pill>)}
              </Row>
            )}
            {filters.excludedCountries.length > 0 && (
              <Row label="Excluded countries">
                {filters.excludedCountries.map(c => <Pill key={c}><span className="leading-none">{countryFlag(c)}</span>{c}</Pill>)}
              </Row>
            )}
            {filters.excludedCurrencies.length > 0 && (
              <Row label="Excluded currencies">
                {filters.excludedCurrencies.map(c => <Pill key={c}>{c}</Pill>)}
              </Row>
            )}
            {filters.languages && (
              <Row label="Languages">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{filters.languages}</span>
              </Row>
            )}
          </>
        )}
      </div>
    </div>
  )
}
