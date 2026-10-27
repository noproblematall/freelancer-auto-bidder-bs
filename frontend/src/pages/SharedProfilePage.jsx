import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSharedProfile, updateSharedProfile } from '../services/profiles'
import TargetingFields from '../components/Profiles/TargetingFields'
import { EMPTY_TARGETING } from '../components/Profiles/targeting'
import { inputClass, labelClass, sectionLabel, card, hintClass } from '../components/Profiles/formStyles'

const INITIAL_STATE = {
  ...EMPTY_TARGETING,
  languages: '',
  skillsSummary: '',
  experienceSummary: '',
  portfolioHighlights: '',
  reviewMode: false,
}

function fromApi(shared) {
  if (!shared) return INITIAL_STATE
  const out = { ...INITIAL_STATE }
  for (const key of Object.keys(EMPTY_TARGETING)) {
    out[key] = Array.isArray(shared[key]) ? shared[key] : []
  }
  for (const key of ['languages', 'skillsSummary', 'experienceSummary', 'portfolioHighlights']) {
    out[key] = shared[key] || ''
  }
  out.reviewMode = shared.reviewMode === true
  return out
}

export default function SharedProfilePage() {
  const navigate = useNavigate()
  const [form, setForm] = useState(INITIAL_STATE)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getSharedProfile()
      .then(data => setForm(fromApi(data.shared)))
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
      const { shared } = await updateSharedProfile(form)
      setForm(fromApi(shared))
      setSaved(true)
      navigate('/profiles')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save shared settings.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/profiles')}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors text-slate-500 dark:text-slate-400"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-navy-950 dark:text-white">Shared Profile Settings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Applied to every bid profile</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-navy-900 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-700 dark:text-slate-200">Loading shared settings...</p>
          </div>
        </div>
      ) : loadFailed ? (
        // Rendering an empty form here would let a save wipe the real settings.
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-sm text-red-600 dark:text-red-400">Failed to load shared settings.</p>
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
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-400">Shared settings saved.</div>
          )}

          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-slate-700 dark:text-slate-200 space-y-1">
            <p className="font-semibold text-navy-950 dark:text-white">Set once, used by every bid profile</p>
            <p className="text-xs">Targeting, languages, review mode, and your freelancer profile are managed here only. Each bid profile keeps its own keywords, budgets, bidding parameters, AI threshold and prompt, and rate limits.</p>
          </div>

          <div className={card}>
            <p className={`${sectionLabel} mb-4`}>Targeting</p>
            <TargetingFields
              value={form}
              onChange={patch => setForm(prev => ({ ...prev, ...patch }))}
            />
          </div>

          <div className={card}>
            <p className={`${sectionLabel} mb-4`}>Search</p>
            <div>
              <label className={labelClass}>Languages (comma-separated)</label>
              <input type="text" value={form.languages} onChange={set('languages')} className={inputClass} placeholder="en" />
              <p className={hintClass}>Applied to every profile's project search. Leave blank to search in all languages.</p>
            </div>
          </div>

          <div className={card}>
            <p className={`${sectionLabel} mb-4`}>Bidding</p>
            <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-navy-900/50 border border-slate-200 dark:border-white/8">
              <div>
                <p className="text-sm font-medium text-navy-950 dark:text-white">Review before sending</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {form.reviewMode
                    ? 'Drafts from every profile are queued on the Bids page for you to edit and approve — nothing is sent automatically'
                    : 'Qualified bids from every profile are placed automatically (within each profile\'s caps and your schedule)'}
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

          <div className="flex items-center justify-end gap-3 pb-6">
            <button
              type="button"
              onClick={() => navigate('/profiles')}
              className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-navy-800 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 text-sm font-medium text-white dark:text-navy-950 bg-navy-900 dark:bg-emerald-400 rounded-lg hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Shared Settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
