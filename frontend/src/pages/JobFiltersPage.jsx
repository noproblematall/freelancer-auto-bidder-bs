import { useState, useEffect } from 'react'
import { getJobFilters, updateJobFilters } from '../services/jobFilters'
import TargetingFields from '../components/Profiles/TargetingFields'
import JobFiltersSummary from '../components/Profiles/JobFiltersSummary'
import { EMPTY_TARGETING } from '../components/Profiles/targeting'
import { inputClass, labelClass, sectionLabel, card, hintClass } from '../components/Profiles/formStyles'

const BUDGET_FIELDS = ['budgetMinFixed', 'budgetMaxFixed', 'budgetMinHourly', 'budgetMaxHourly']

const INITIAL_FORM = {
  ...EMPTY_TARGETING,
  languages: '',
  budgetMinFixed: '',
  budgetMaxFixed: '',
  budgetMinHourly: '',
  budgetMaxHourly: '',
}

// API shape → form strings
function toForm(filters) {
  if (!filters) return INITIAL_FORM
  const out = { ...INITIAL_FORM }
  for (const key of Object.keys(EMPTY_TARGETING)) {
    out[key] = Array.isArray(filters[key]) ? filters[key] : []
  }
  out.languages = filters.languages || ''
  for (const key of BUDGET_FIELDS) {
    out[key] = filters[key] != null ? String(filters[key]) : ''
  }
  return out
}

// Form strings → numbers (or null) for the API
function toApi(form) {
  const out = { ...form }
  for (const key of BUDGET_FIELDS) {
    out[key] = form[key] === '' ? null : Number(form[key])
  }
  return out
}

export default function JobFiltersPage() {
  const [filters, setFilters] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(INITIAL_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getJobFilters()
      .then(data => setFilters(data.filters))
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false))
  }, [])

  function startEditing() {
    setForm(toForm(filters))
    setError(null)
    setSaved(false)
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setError(null)
  }

  function set(field) {
    return (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  function fail(message) {
    setError(message)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const payload = toApi(form)
    if (payload.budgetMinFixed != null && payload.budgetMaxFixed != null && payload.budgetMinFixed > payload.budgetMaxFixed) {
      return fail('Fixed-price minimum budget cannot be greater than maximum.')
    }
    if (payload.budgetMinHourly != null && payload.budgetMaxHourly != null && payload.budgetMinHourly > payload.budgetMaxHourly) {
      return fail('Hourly minimum rate cannot be greater than maximum.')
    }
    setSaving(true)
    try {
      const data = await updateJobFilters(payload)
      setFilters(data.filters)
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      fail(err.response?.data?.error || 'Failed to save job filters.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy-950 dark:text-white">Job Filters</h1>
        <p className="text-sm text-slate-700 dark:text-slate-200 mt-1">
          Narrow which projects Growlance looks at. These filters apply to every bid profile's search.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-navy-900 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-700 dark:text-slate-200">Loading job filters...</p>
          </div>
        </div>
      ) : loadFailed ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-sm text-red-600 dark:text-red-400">Failed to load job filters.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-navy-900 dark:bg-emerald-400 text-white dark:text-navy-950 hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : !editing ? (
        <div className="space-y-4">
          {saved && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-400">Job filters saved.</div>
          )}
          <JobFiltersSummary filters={filters} onEdit={startEditing} />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">{error}</div>
          )}

          <div className={card}>
            <p className={`${sectionLabel} mb-4`}>Client Location &amp; Currency</p>
            <TargetingFields
              value={form}
              onChange={patch => setForm(prev => ({ ...prev, ...patch }))}
            />
          </div>

          <div className={card}>
            <p className={`${sectionLabel} mb-4`}>Budget</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Fixed-Price Budget Range (USD)</label>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" min="0" value={form.budgetMinFixed} onChange={set('budgetMinFixed')} className={inputClass} placeholder="Min ($)" />
                  <input type="number" min="0" value={form.budgetMaxFixed} onChange={set('budgetMaxFixed')} className={inputClass} placeholder="Max ($)" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Hourly Rate Range (USD/hr)</label>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" min="0" value={form.budgetMinHourly} onChange={set('budgetMinHourly')} className={inputClass} placeholder="Min" />
                  <input type="number" min="0" value={form.budgetMaxHourly} onChange={set('budgetMaxHourly')} className={inputClass} placeholder="Max" />
                </div>
              </div>
            </div>
            <p className={hintClass}>Projects outside these ranges are skipped. Leave a field blank for no bound.</p>
          </div>

          <div className={card}>
            <p className={`${sectionLabel} mb-4`}>Language</p>
            <div>
              <label className={labelClass}>Project languages (comma-separated codes)</label>
              <input type="text" value={form.languages} onChange={set('languages')} className={inputClass} placeholder="en, es" />
              <p className={hintClass}>Only projects posted in these languages are searched. Leave blank for all languages.</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pb-6">
            <button
              type="button"
              onClick={cancelEditing}
              className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-navy-800 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 text-sm font-medium text-white dark:text-navy-950 bg-navy-900 dark:bg-emerald-400 rounded-lg hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Filters'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
