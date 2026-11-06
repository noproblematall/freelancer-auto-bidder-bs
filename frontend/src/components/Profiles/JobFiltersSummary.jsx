import { REGIONS } from './targeting'

const REGION_LABELS = Object.fromEntries(REGIONS.flatMap(g => g.items.map(r => [r.key, r.label])))

const regionNames = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null
const currencyNames = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['en'], { type: 'currency' })
  : null

function countryName(code) {
  try { return regionNames?.of(code) || code } catch { return code }
}
function currencyName(code) {
  try { return currencyNames?.of(code) || code } catch { return code }
}

// "$50 and up" / "up to $500" / "$50 – $500"
function formatRange(min, max, suffix = '') {
  if (min != null && max != null) return `$${min} – $${max}${suffix}`
  if (min != null) return `$${min}${suffix} and up`
  if (max != null) return `up to $${max}${suffix}`
  return 'Any'
}

function Pill({ code, children }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium bg-slate-100 dark:bg-navy-700/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 px-2 py-0.5 rounded-full">
      {children}
      {code && <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">{code}</span>}
    </span>
  )
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 items-start py-2.5 border-b border-slate-100 dark:border-white/8 last:border-b-0">
      <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide pt-0.5">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

/**
 * Read-only summary of the account's job filters.
 * `filters` is the API shape; `onEdit` renders an Edit button when given.
 */
export default function JobFiltersSummary({ filters, onEdit }) {
  const lists = ['countries', 'excludedRegions', 'countryExceptions', 'excludedCountries', 'excludedCurrencies']
  const hasFixedBudget = filters.budgetMinFixed != null || filters.budgetMaxFixed != null
  const hasHourlyBudget = filters.budgetMinHourly != null || filters.budgetMaxHourly != null
  const hasContent =
    lists.some(k => Array.isArray(filters[k]) && filters[k].length > 0) ||
    !!filters.languages || hasFixedBudget || hasHourlyBudget

  const text = (value) => <span className="text-sm text-slate-700 dark:text-slate-200">{value}</span>

  return (
    <div className="bg-white dark:bg-navy-800/90 rounded-xl shadow-lg dark:shadow-2xl dark:shadow-black/50 border border-slate-200 dark:border-white/6 overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between gap-3 bg-slate-50 dark:bg-navy-900/40 border-b border-slate-100 dark:border-white/8">
        <div className="flex items-center gap-2.5 min-w-0">
          <svg className="w-4 h-4 text-navy-700 dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
          </svg>
          <h2 className="text-sm font-bold text-navy-950 dark:text-white truncate">Current filters</h2>
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 px-3 py-1.5 text-xs font-medium text-white dark:text-navy-950 bg-navy-900 dark:bg-emerald-400 rounded-md hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors shadow-sm"
          >
            Edit
          </button>
        )}
      </div>

      <div className="px-5 py-1">
        {!hasContent ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-3">
            No filters set. Every profile searches all countries, currencies, budgets, and languages.
          </p>
        ) : (
          <>
            <Row label="Only countries">
              {filters.countries.length > 0
                ? filters.countries.map(c => <Pill key={c} code={c}>{countryName(c)}</Pill>)
                : text('All countries')}
            </Row>
            <Row label="Excluded regions">
              {filters.excludedRegions.length > 0
                ? filters.excludedRegions.map(r => <Pill key={r}>{REGION_LABELS[r] || r}</Pill>)
                : text('None')}
            </Row>
            {filters.countryExceptions.length > 0 && (
              <Row label="Allowed anyway">
                {filters.countryExceptions.map(c => <Pill key={c} code={c}>{countryName(c)}</Pill>)}
              </Row>
            )}
            <Row label="Excluded countries">
              {filters.excludedCountries.length > 0
                ? filters.excludedCountries.map(c => <Pill key={c} code={c}>{countryName(c)}</Pill>)
                : text('None')}
            </Row>
            <Row label="Excluded currencies">
              {filters.excludedCurrencies.length > 0
                ? filters.excludedCurrencies.map(c => <Pill key={c} code={c}>{currencyName(c)}</Pill>)
                : text('None')}
            </Row>
            <Row label="Fixed-price budget">{text(formatRange(filters.budgetMinFixed, filters.budgetMaxFixed))}</Row>
            <Row label="Hourly rate">{text(formatRange(filters.budgetMinHourly, filters.budgetMaxHourly, '/hr'))}</Row>
            <Row label="Languages">{text(filters.languages || 'All languages')}</Row>
          </>
        )}
      </div>
    </div>
  )
}
