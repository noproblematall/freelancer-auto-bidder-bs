import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { inputClass, labelClass, sectionLabel, card } from './formStyles'

const INITIAL_STATE = {
  name: '',
  searchKeywords: '',
  projectTypes: 'both',
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
        projectTypes: profile.projectTypes || 'both',
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

    try {
      await onSave(form)
    } catch (err) {
      fail(err.response?.data?.error || 'Failed to save profile')
    }
  }

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
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
          Client countries, regions, currencies, languages, and budget ranges are filtered for every profile under{' '}
          <Link to="/job-filters" className="font-medium text-navy-700 dark:text-emerald-400 hover:underline">Job Filters</Link>.
          Review mode and your freelancer profile for the AI live in{' '}
          <Link to="/settings?section=autobidding" className="font-medium text-navy-700 dark:text-emerald-400 hover:underline">Settings</Link>.
        </p>
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
