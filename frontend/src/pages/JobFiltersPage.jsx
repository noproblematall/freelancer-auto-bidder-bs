import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJobFilters, updateJobFilters } from '../services/jobFilters'
import TargetingFields from '../components/Profiles/TargetingFields'
import { EMPTY_TARGETING } from '../components/Profiles/targeting'
import { inputClass, labelClass, sectionLabel, card, hintClass } from '../components/Profiles/formStyles'

const INITIAL_STATE = {
  ...EMPTY_TARGETING,
  languages: '',
}

function fromApi(filters) {
  if (!filters) return INITIAL_STATE
  const out = { ...INITIAL_STATE }
  for (const key of Object.keys(EMPTY_TARGETING)) {
    out[key] = Array.isArray(filters[key]) ? filters[key] : []
  }
  out.languages = filters.languages || ''
  return out
}

export default function JobFiltersPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState(INITIAL_STATE)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getJobFilters()
      .then(data => setForm(fromApi(data.filters)))
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false))
  }, [])

  function set(field) {
    return (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      const { filters } = await updateJobFilters(form)
      setForm(fromApi(filters))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save job filters.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
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
        // Rendering an empty form here would let a save wipe the real filters.
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-sm text-red-600 dark:text-red-400">Failed to load job filters.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-navy-900 dark:bg-emerald-400 text-white dark:text-navy-950 hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">{error}</div>
          )}
          {saved && !error && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-400">Job filters saved.</div>
          )}

          <div className={card}>
            <p className={`${sectionLabel} mb-4`}>Client Location &amp; Currency</p>
            <TargetingFields
              value={form}
              onChange={patch => setForm(prev => ({ ...prev, ...patch }))}
            />
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
              onClick={() => navigate('/profiles')}
              className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-navy-800 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors"
            >
              Back to Profiles
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
