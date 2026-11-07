import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { inputClass, labelClass, sectionLabel, card } from './formStyles'
import SegmentedControl from '../SegmentedControl'

const hint = 'text-xs text-slate-500 dark:text-slate-400 mt-1'

// Every profile bids on both fixed-price and hourly projects; each kind has
// its own pricing and delivery settings below. The hourly rate itself is
// account-wide (Settings → Auto-Bidding).
const INITIAL_STATE = {
  name: '',
  searchKeywords: '',
  // Fixed-price projects
  fixedBidStrategy: 'ai',
  bidPercentage: '',
  fixedPeriodStrategy: 'ai',
  // Hourly projects
  hourlyRateStrategy: 'my_rate',
  hourlyPeriodStrategy: 'ai',
  // AI
  minRelevanceScore: '70',
  proposalPrompt: '',
}

const str = (v, fallback = '') => (v != null ? String(v) : fallback)

function fromProfile(profile) {
  return {
    name: profile.name || '',
    searchKeywords: profile.searchKeywords || '',
    fixedBidStrategy: profile.fixedBidStrategy || 'ai',
    bidPercentage: str(profile.bidPercentage),
    fixedPeriodStrategy: profile.fixedPeriodStrategy || 'ai',
    hourlyRateStrategy: profile.hourlyRateStrategy || 'my_rate',
    hourlyPeriodStrategy: profile.hourlyPeriodStrategy || 'ai',
    minRelevanceScore: str(profile.minRelevanceScore, '70'),
    proposalPrompt: profile.proposalPrompt || '',
  }
}

// Delivery period block shared by both project kinds. `kind` is the form
// field prefix ("fixed" | "hourly"). Min/max/fallback days for AI estimates
// are account-wide (Settings → Auto-Bidding).
function PeriodFields({ kind, form, setForm, aiDescription, formulaNote, fallbackDays }) {
  const strategyKey = `${kind}PeriodStrategy`
  const isAi = form[strategyKey] === 'ai'
  const settingsLink = (
    <Link to="/settings?section=autobidding" className="font-medium text-navy-700 dark:text-emerald-400 hover:underline">Settings → Auto-Bidding</Link>
  )

  return (
    <>
      <div>
        <label className={labelClass}>Delivery Period</label>
        <SegmentedControl
          label={`${kind === 'fixed' ? 'Fixed-price' : 'Hourly'} delivery period`}
          value={form[strategyKey]}
          onChange={v => setForm(prev => ({ ...prev, [strategyKey]: v }))}
          options={[
            { value: 'ai', label: 'AI-suggested', description: aiDescription },
            { value: 'fixed', label: 'Fixed days', description: `Always promise your fallback days (${fallbackDays} days)` },
          ]}
        />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {isAi
          ? <>{formulaNote ? `${formulaNote} ` : ''}Min, max and fallback days apply to every profile and are set under {settingsLink}.</>
          : <>The fallback days ({fallbackDays}) apply to every profile and are set under {settingsLink}.</>}
      </p>
    </>
  )
}

export default function ProfileForm({ profile = null, onSave, onCancel, saving = false, error: externalError = null }) {
  const { user } = useAuth()
  const [form, setForm] = useState(INITIAL_STATE)
  const [error, setError] = useState(null)
  const isEdit = !!profile
  const accountRate = user?.hourlyRate > 0 ? user.hourlyRate : null
  const fallbackDays = user?.periodFallbackDays > 0 ? user.periodFallbackDays : 7
  const aiBidPct = user?.aiBidPercentage > 0 ? user.aiBidPercentage : 100

  useEffect(() => {
    setForm(profile ? fromProfile(profile) : INITIAL_STATE)
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
    if (form.fixedBidStrategy === 'percentage' && !(Number(form.bidPercentage) > 0 && Number(form.bidPercentage) <= 100)) return fail('Fixed-price projects: bid percentage must be between 1 and 100.')

    try {
      await onSave(form)
    } catch (err) {
      fail(err.response?.data?.error || 'Failed to save profile')
    }
  }

  const displayError = error || externalError
  const rateLabel = accountRate ? `$${accountRate}/hr` : 'not set yet'

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
          Your hourly rate, delivery period bounds, review mode and your freelancer profile for the AI live in{' '}
          <Link to="/settings?section=autobidding" className="font-medium text-navy-700 dark:text-emerald-400 hover:underline">Settings</Link>.
        </p>
      </div>

      {/* Search Criteria */}
      <div className={card}>
        <p className={`${sectionLabel} mb-4`}>Search Criteria</p>
        <div>
          <label className={labelClass}>Keywords (comma-separated)</label>
          <input type="text" value={form.searchKeywords} onChange={set('searchKeywords')} className={inputClass} placeholder="react, node, shopify" />
          <p className={hint}>Fixed-price and hourly projects are both searched. How each kind is priced is set below.</p>
        </div>
      </div>

      {/* Fixed-price projects */}
      <div className={card}>
        <p className={`${sectionLabel} mb-1`}>Fixed-Price Projects</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Projects with a total budget. The bid is always kept inside the client's budget range.</p>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Bid Amount</label>
            <SegmentedControl
              label="Fixed-price bid amount"
              value={form.fixedBidStrategy}
              onChange={v => setForm(prev => ({ ...prev, fixedBidStrategy: v }))}
              options={[
                { value: 'ai', label: 'AI-suggested', description: `Estimated from the work involved and your hourly rate${aiBidPct !== 100 ? `, scaled to ${aiBidPct}% (Settings → Auto-Bidding)` : ''}, within the budget` },
                {
                  value: 'percentage',
                  label: '% of budget',
                  description: 'A set percentage of the project’s maximum budget',
                  extra: (
                    <>
                      <label className={labelClass} htmlFor="fixed-bid-percentage">Bid Percentage (%)</label>
                      <input id="fixed-bid-percentage" type="number" value={form.bidPercentage} onChange={set('bidPercentage')} className={inputClass} placeholder="80" min="1" max="100" step="1" />
                      <p className={hint}>When a client lists no maximum budget, the AI suggestion is used instead.</p>
                    </>
                  ),
                },
              ]}
            />
          </div>
          <PeriodFields
            kind="fixed"
            form={form}
            setForm={setForm}
            fallbackDays={fallbackDays}
            aiDescription="Estimated from the budget and your hourly rate, blended with the AI’s estimate"
            formulaNote={`Days = budget ÷ (8 × your hourly rate, ${rateLabel}) at 90% weight + the AI's estimate at 10%.`}
          />
        </div>
      </div>

      {/* Hourly projects */}
      <div className={card}>
        <p className={`${sectionLabel} mb-1`}>Hourly Projects</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Projects paid by the hour. The bid is a rate per hour.</p>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Hourly Rate</label>
            <SegmentedControl
              label="Hourly rate"
              value={form.hourlyRateStrategy}
              onChange={v => setForm(prev => ({ ...prev, hourlyRateStrategy: v }))}
              options={[
                { value: 'my_rate', label: 'My rate', description: `Bid your account-wide rate (${rateLabel}) as-is, converted to the project’s currency` },
                { value: 'ai', label: 'AI-suggested', description: 'The AI picks a rate inside the client’s listed range, as close to yours as it allows' },
              ]}
            />
            {!accountRate && form.hourlyRateStrategy === 'my_rate' && (
              <p className={`${hint} text-amber-600 dark:text-amber-400`}>
                No hourly rate is set yet, so the AI suggestion will be used. Set it under{' '}
                <Link to="/settings?section=autobidding" className="font-medium underline">Settings → Auto-Bidding</Link>.
              </p>
            )}
          </div>
          <PeriodFields
            kind="hourly"
            form={form}
            setForm={setForm}
            fallbackDays={fallbackDays}
            aiDescription="The AI’s estimate of the first engagement"
            formulaNote={null}
          />
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
            <label className={labelClass}>Extra Proposal Instructions</label>
            <textarea value={form.proposalPrompt} onChange={set('proposalPrompt')} rows={5} className={inputClass} placeholder="e.g. Mention my Shopify Plus experience and always offer a free 15-minute call." />
            <p className={hint}>Appended to the account-wide proposal prompt (Settings → Auto-Bidding) for bids from this profile. Leave blank to use the shared prompt as is.</p>
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
