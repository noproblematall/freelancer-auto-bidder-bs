import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSharedProfile } from '../../services/profiles'
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
 * Summary of the user's shared profile settings, shown above the profile
 * list. Self-loading so ProfilesPage stays focused on the profiles themselves.
 */
export default function SharedSettingsCard() {
  const navigate = useNavigate()
  const [shared, setShared] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    getSharedProfile()
      .then(data => setShared(data.shared))
      .catch(() => setFailed(true))
  }, [])

  if (failed) return null

  const lists = ['countries', 'excludedRegions', 'countryExceptions', 'excludedCountries', 'excludedCurrencies']
  const texts = ['languages', 'skillsSummary', 'experienceSummary', 'portfolioHighlights']
  const hasContent = !!shared && (
    lists.some(k => Array.isArray(shared[k]) && shared[k].length > 0) ||
    texts.some(k => !!shared[k])
  )

  const contextSet = shared ? [
    shared.skillsSummary && 'Skills',
    shared.experienceSummary && 'Experience',
    shared.portfolioHighlights && 'Portfolio',
  ].filter(Boolean) : []

  return (
    <div className="bg-white dark:bg-navy-800/90 rounded-xl shadow-lg dark:shadow-2xl dark:shadow-black/50 border border-slate-200 dark:border-white/6 overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between gap-3 bg-slate-50 dark:bg-navy-900/40 border-b border-slate-100 dark:border-white/8">
        <div className="flex items-center gap-2.5 min-w-0">
          <svg className="w-4 h-4 text-navy-700 dark:text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
          </svg>
          <h3 className="text-sm font-bold text-navy-950 dark:text-white truncate">Shared Settings</h3>
          <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">applies to every profile</span>
        </div>
        <button
          onClick={() => navigate('/profiles/shared')}
          className="shrink-0 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-navy-700 border border-slate-200 dark:border-white/10 rounded-md hover:bg-slate-50 dark:hover:bg-navy-600 transition-colors"
        >
          {hasContent ? 'Edit' : 'Set up'}
        </button>
      </div>

      <div className="px-4 py-3 space-y-1.5">
        {shared && (
          <Row label="Review before sending">
            <Pill>{shared.reviewMode ? 'On — drafts queued for approval' : 'Off — qualified bids are placed automatically'}</Pill>
          </Row>
        )}
        {!shared ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">Loading...</p>
        ) : !hasContent ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Set countries, exclusions, languages, and your skills once here instead of repeating them in every profile.
          </p>
        ) : (
          <div className="space-y-1.5">
            {shared.countries.length > 0 && (
              <Row label="Only">
                {shared.countries.map(c => <Pill key={c}><span className="leading-none">{countryFlag(c)}</span>{c}</Pill>)}
              </Row>
            )}
            {shared.excludedRegions.length > 0 && (
              <Row label="Excluded regions">
                {shared.excludedRegions.map(r => <Pill key={r}>{REGION_LABELS[r] || r}</Pill>)}
              </Row>
            )}
            {shared.countryExceptions.length > 0 && (
              <Row label="Exceptions">
                {shared.countryExceptions.map(c => <Pill key={c}><span className="leading-none">{countryFlag(c)}</span>{c}</Pill>)}
              </Row>
            )}
            {shared.excludedCountries.length > 0 && (
              <Row label="Excluded countries">
                {shared.excludedCountries.map(c => <Pill key={c}><span className="leading-none">{countryFlag(c)}</span>{c}</Pill>)}
              </Row>
            )}
            {shared.excludedCurrencies.length > 0 && (
              <Row label="Excluded currencies">
                {shared.excludedCurrencies.map(c => <Pill key={c}>{c}</Pill>)}
              </Row>
            )}
            {shared.languages && (
              <Row label="Languages">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{shared.languages}</span>
              </Row>
            )}
            {contextSet.length > 0 && (
              <Row label="AI context">
                {contextSet.map(k => <Pill key={k}>{k}</Pill>)}
              </Row>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
