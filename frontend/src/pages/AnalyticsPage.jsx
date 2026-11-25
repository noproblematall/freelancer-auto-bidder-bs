import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart } from 'recharts'
import { format, parseISO } from 'date-fns'
import { getAnalyticsOverview, runAiAnalytics } from '../services/analytics'
import { timeAgo } from '../utils/formatters'

// Chart colours: validated categorical slots (blue = sent, aqua = won, red = errors),
// stepped separately for the dark surface.
const COLORS = {
  light: { sent: '#2a78d6', replied: '#8a63d2', won: '#1baf7a', errors: '#e34948', grid: '#e1e0d9', axis: '#64748b' },
  dark:  { sent: '#3987e5', replied: '#a07fe0', won: '#199e70', errors: '#e66767', grid: '#2c2c2a', axis: '#94a3b8' },
}

function useDark() {
  const read = () => typeof document !== 'undefined' && (document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark')
  const [dark, setDark] = useState(read)
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(read()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

const n = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: d }))
const pctText = (v) => (v === null || v === undefined ? '—' : `${v}%`)
const usd = (v) => (v === null || v === undefined ? '—' : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
const minutes = (m) => (m === null || m === undefined ? '—' : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} d`)

const CARD = 'bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50'

function Card({ title, subtitle, right, children, className = '' }) {
  return (
    <section className={`${CARD} p-5 ${className}`}>
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && <h2 className="text-base font-semibold text-navy-950 dark:text-white">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

function Kpi({ label, value, hint, tone }) {
  const color = tone === 'good' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-navy-950 dark:text-white'
  return (
    <div className={`${CARD} px-4 py-3`} title={hint}>
      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</p>
      <p className={`text-xl font-semibold mt-0.5 ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{hint}</p>}
    </div>
  )
}

// Rows of "segment → sent → replied → won", with a bar for the reply rate (the
// early signal; awards are rare) and the win rate beside it, so the best and
// worst segments stand out without reading every number.
function RateTable({ rows, label, empty = 'No bids in this period' }) {
  if (!rows || rows.length === 0) return <p className="text-sm text-slate-500 dark:text-slate-400">{empty}</p>
  const max = Math.max(...rows.map((r) => r.replyRate || 0), 1)
  const total = rows.reduce((a, r) => a + r.sent, 0)
  const few = (r) => r.sent < 10
  // Six columns have to fit a one-third-width card: the label column takes
  // the slack, numbers stay narrow, and the bar is short.
  return (
    <table className="w-full text-sm table-fixed">
      <colgroup>
        <col />
        <col className="w-11" />
        <col className="w-14" />
        <col className="w-11" />
        <col className="w-[5.5rem]" />
        <col className="w-11" />
      </colgroup>
      <thead>
        <tr className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <th className="text-left font-medium pb-2">{label}</th>
          <th className="text-right font-medium pb-2 pl-1">Sent</th>
          <th className="text-right font-medium pb-2 pl-1">Replied</th>
          <th className="text-right font-medium pb-2 pl-1">Won</th>
          <th className="text-right font-medium pb-2 pl-1">Reply</th>
          <th className="text-right font-medium pb-2 pl-1">Win</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-slate-100 dark:border-white/5">
            <td className="py-1.5 text-navy-950 dark:text-white truncate" title={total > 0 ? `${r.key} · ${Math.round((r.sent / total) * 100)}% of bids sent` : r.key}>
              {r.key}
            </td>
            <td className="py-1.5 pl-1 text-right tabular-nums text-slate-700 dark:text-slate-200">{n(r.sent)}</td>
            <td className="py-1.5 pl-1 text-right tabular-nums text-slate-700 dark:text-slate-200">{n(r.replied)}</td>
            <td className="py-1.5 pl-1 text-right tabular-nums text-slate-700 dark:text-slate-200">{n(r.won)}</td>
            <td className="py-1.5 pl-1">
              <div className="flex items-center gap-1.5 justify-end">
                <div className="h-1.5 w-8 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden" title="reply rate, relative to the best row">
                  <div className="h-full rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: `${r.replyRate ? (r.replyRate / max) * 100 : 0}%` }} />
                </div>
                <span className={`tabular-nums text-right ${few(r) ? 'text-slate-400' : 'text-slate-700 dark:text-slate-200'}`} title={few(r) ? 'Fewer than 10 bids — not meaningful yet' : 'replied ÷ sent'}>{pctText(r.replyRate)}</span>
              </div>
            </td>
            <td className={`py-1.5 pl-1 text-right tabular-nums ${few(r) ? 'text-slate-400' : 'text-emerald-700 dark:text-emerald-400'}`} title={few(r) ? 'Fewer than 10 bids — not meaningful yet' : 'won ÷ sent'}>{pctText(r.winRate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Freelancer-side levers (verifications, portfolio, exams…) with what is done.
function Checklist({ checklist }) {
  if (!checklist?.items?.length) return null
  return (
    <ul className="space-y-1.5">
      {checklist.items.map((i) => (
        <li key={i.key} className="flex items-start gap-2 text-sm">
          <span className={`mt-0.5 inline-flex w-4 h-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${i.done === true ? 'bg-emerald-500 text-white' : i.done === null ? 'bg-slate-200 dark:bg-white/10 text-slate-500' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}`}>
            {i.done === true ? '✓' : i.done === null ? '?' : '!'}
          </span>
          <div className="min-w-0">
            <a href={i.url} target="_blank" rel="noopener noreferrer" className={`font-medium hover:underline ${i.done === true ? 'text-slate-500 dark:text-slate-400 line-through decoration-slate-300' : 'text-navy-950 dark:text-white'}`}>{i.title}</a>
            {i.done !== true && <p className="text-xs text-slate-600 dark:text-slate-300">{i.why}</p>}
          </div>
        </li>
      ))}
    </ul>
  )
}

const DECISION_TEXT = {
  bid: 'Bid placed', queued: 'Draft queued for review', not_reached: 'Bid cap reached before it was looked at',
  excluded_country: 'Client country excluded by Job Filters', excluded_region: 'Client region excluded by Job Filters', excluded_currency: 'Currency excluded by Job Filters',
  budget: 'Budget outside the profile range', too_many_bids: 'Too many bids already on the project', low_client_score: 'Client score below your minimum',
  low_score: 'AI relevance score below the profile minimum', prompt_skip: 'Proposal prompt rules said not to bid',
  analyze_error: 'AI relevance check failed', proposal_error: 'Proposal could not be written', pricing_error: 'Bid could not be priced',
  bid_error: 'Freelancer rejected the bid', pipeline_error: 'Unexpected error',
}

function Stars({ value }) {
  if (value === null || value === undefined) return <span className="text-slate-400">no rating yet</span>
  return (
    <span className="inline-flex items-center gap-1" title={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} className={`w-4 h-4 ${value >= i - 0.25 ? 'text-amber-400' : 'text-slate-300 dark:text-slate-600'}`} viewBox="0 0 20 20" fill="currentColor">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 0 0-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 0 0 .951-.69l1.07-3.292Z" />
        </svg>
      ))}
      <span className="ml-1 text-sm font-semibold text-navy-950 dark:text-white">{value}</span>
    </span>
  )
}

function Badge({ ok, children }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${ok ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' : 'bg-slate-50 dark:bg-navy-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10'}`}>
      {ok ? '✓' : '○'} {children}
    </span>
  )
}

function Funnel({ funnel }) {
  if (!funnel) return null
  const steps = [
    ['Projects found', funnel.discovered],
    ['Analysed by AI', funnel.analysed],
    [`Scored ≥ ${funnel.minScore}`, funnel.qualified],
    ['Bids sent', funnel.bid],
    ['Client replied', funnel.replied ?? 0],
    ['Won', funnel.won],
  ]
  const top = Math.max(steps[0][1] || 0, 1)
  return (
    <div className="space-y-2">
      {steps.map(([label, value], i) => {
        const prev = i > 0 ? steps[i - 1][1] : null
        const conv = prev && value <= prev ? Math.round((value / prev) * 100) : null
        return (
          <div key={label} className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0 text-slate-700 dark:text-slate-200">{label}</span>
            <div className="flex-1 h-5 rounded bg-slate-100 dark:bg-white/5 overflow-hidden">
              <div className={`h-full rounded ${i === 5 ? 'bg-emerald-500' : 'bg-[#2a78d6] dark:bg-[#3987e5]'}`} style={{ width: `${Math.max(1, (value / top) * 100)}%` }} />
            </div>
            <span className="w-16 text-right tabular-nums text-navy-950 dark:text-white">{n(value)}</span>
            <span className="w-12 text-right tabular-nums text-[11px] text-slate-500 dark:text-slate-400">{conv !== null ? `${conv}%` : ''}</span>
          </div>
        )
      })}
    </div>
  )
}

const tooltipStyle = (dark) => ({
  backgroundColor: dark ? 'rgba(23,30,46,0.98)' : 'rgba(255,255,255,0.98)',
  border: `1px solid ${dark ? '#2c2c2a' : '#e2e8f0'}`, borderRadius: '10px', padding: '8px 12px', fontSize: '12px', color: dark ? '#f0efec' : '#0f172a',
})

function AiReport({ report, createdAt, model, period }) {
  if (!report) return null
  const impact = { high: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400', medium: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', low: 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300' }
  const score = typeof report.score === 'number' ? Math.max(0, Math.min(100, Math.round(report.score))) : null
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        {score !== null && (
          <div className="shrink-0 flex flex-col items-center" title="The model's 0–100 rating of how well this account turns its full bid allowance into awarded projects: volume used, replies and awards so far, profile and verifications, pricing, proposal. Under 40 = bids are being lost to avoidable problems; 70+ = mostly fine-tuning.">
            <div className="w-20 h-20 rounded-full border-4 flex items-center justify-center" style={{ borderColor: score >= 70 ? '#1baf7a' : score >= 40 ? '#eda100' : '#e34948' }}>
              <span className="text-2xl font-bold text-navy-950 dark:text-white">{score}</span>
            </div>
            <span className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">readiness / 100</span>
          </div>
        )}
        <div>
          <p className="text-base font-semibold text-navy-950 dark:text-white">{report.headline}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Reviewed {createdAt ? timeAgo(new Date(createdAt)) : ''}{period ? ` · last ${period === 'all' ? 'all time' : period}` : ''}{model ? ` · ${model}` : ''}
            {report.nextReviewDays ? ` · review again in ${report.nextReviewDays} days` : ''}
          </p>
        </div>
      </div>

      {Array.isArray(report.actions) && report.actions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-navy-950 dark:text-white mb-2">What to change, in order</h3>
          <ol className="space-y-3">
            {report.actions.map((a, i) => (
              <li key={i} className="rounded-lg border border-slate-200 dark:border-white/8 p-3">
                <div className="flex items-start gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-navy-950 dark:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center">{a.priority ?? i + 1}</span>
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-navy-950 dark:text-white">{a.title}</p>
                    {a.where && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Where: {a.where}</p>}
                    {a.change && <p className="mt-1.5 text-slate-800 dark:text-slate-100"><span className="font-medium">Change:</span> {a.change}</p>}
                    {a.why && <p className="mt-1 text-slate-600 dark:text-slate-300"><span className="font-medium">Why:</span> {a.why}</p>}
                    {a.expected && <p className="mt-1 text-emerald-700 dark:text-emerald-400"><span className="font-medium">Expected:</span> {a.expected}</p>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {Array.isArray(report.problems) && report.problems.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-navy-950 dark:text-white mb-2">Problems found</h3>
            <ul className="space-y-2">
              {report.problems.map((p, i) => (
                <li key={i} className="text-sm">
                  <span className={`inline-block mr-2 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${impact[p.impact] || impact.low}`}>{p.impact || 'note'}</span>
                  <span className="font-medium text-navy-950 dark:text-white">{p.title}</span>
                  {p.evidence && <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{p.evidence}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {Array.isArray(report.strengths) && report.strengths.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-navy-950 dark:text-white mb-2">Working well</h3>
            <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-200 list-disc pl-5">
              {report.strengths.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        )}
      </div>

      {Array.isArray(report.proposalAdvice) && report.proposalAdvice.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-navy-950 dark:text-white mb-2">Proposal text</h3>
          <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-200 list-disc pl-5">
            {report.proposalAdvice.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {Array.isArray(report.experiments) && report.experiments.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-navy-950 dark:text-white mb-2">Experiments to run</h3>
          <ul className="space-y-2 text-sm">
            {report.experiments.map((e, i) => (
              <li key={i} className="text-slate-700 dark:text-slate-200">
                <span className="font-medium text-navy-950 dark:text-white">{e.title}</span>
                {e.how && <span> — {e.how}</span>}
                {e.measure && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Measure: {e.measure}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {report.raw && <pre className="text-xs whitespace-pre-wrap text-slate-600 dark:text-slate-300">{report.raw}</pre>}
    </div>
  )
}

export default function AnalyticsPage() {
  const dark = useDark()
  const c = dark ? COLORS.dark : COLORS.light
  const [period, setPeriod] = useState('30d')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ai, setAi] = useState(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState(null)

  const load = useCallback(async (p) => {
    setLoading(true); setError(null)
    try { setData(await getAnalyticsOverview(p)) } catch (e) { setError(e.response?.data?.error || e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(period) }, [period, load])

  async function handleAi() {
    setAiBusy(true); setAiError(null)
    try { setAi(await runAiAnalytics(period)) } catch (e) { setAiError(e.response?.data?.error || e.message) } finally { setAiBusy(false) }
  }

  const acct = data?.account
  const prof = acct?.profile
  const rep = acct?.reputation
  const b = data?.bids
  const t = b?.totals
  const fmtDay = (d) => { try { return format(parseISO(d), period === '7d' ? 'EEE d' : 'MMM d') } catch { return d } }
  const tickEvery = b?.series?.length > 40 ? 6 : b?.series?.length > 14 ? 2 : 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-navy-950 dark:text-white">Analytics</h1>
          <p className="text-sm text-slate-700 dark:text-slate-200 mt-1">Your Freelancer standing, how the bidding performs, and what to change to win more</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="px-3 py-1.5 border border-slate-200 dark:border-white/10 rounded-lg text-sm bg-white dark:bg-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500">
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="all">All time</option>
          </select>
          <button onClick={() => load(period)} disabled={loading} title="Refresh" className="p-2 hover:bg-slate-100 dark:hover:bg-navy-800 rounded-lg transition-colors disabled:opacity-50">
            <svg className={`w-4 h-4 text-slate-600 dark:text-slate-300 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
          </button>
          <button onClick={handleAi} disabled={aiBusy} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-navy-950 hover:bg-navy-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-60 transition-colors shadow-sm">
            {aiBusy ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" /></svg>
            )}
            {aiBusy ? 'Reviewing…' : 'AI analytics'}
          </button>
        </div>
      </div>

      {error && <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-sm text-red-700 dark:text-red-300">{error}</div>}

      {/* AI review */}
      {(ai?.report || aiBusy || aiError) && (
        <Card title="AI review" subtitle="Built from everything on this page plus your profiles, filters and settings. The goal it optimises is projects won in total with the full bid allowance, not the win rate; each action names the setting to change.">
          {aiError && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{aiError}</p>}
          {aiBusy && (
            <p className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 mb-3">
              <svg className="w-4 h-4 animate-spin text-navy-700 dark:text-emerald-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" /></svg>
              Reading your account and bid history and asking the model for a plan. This takes about half a minute.
            </p>
          )}
          {ai?.report && <AiReport report={ai.report} createdAt={ai.createdAt} model={ai.model} period={ai.period} />}
        </Card>
      )}
      {!ai?.report && !aiBusy && !aiError && (
        <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-white/15 text-sm text-slate-600 dark:text-slate-300">
          Click <span className="font-semibold text-navy-950 dark:text-white">AI analytics</span> to get a ranked list of changes to make in BidPilot and on Freelancer.com, based on the numbers below. The result shows here after you click.
        </div>
      )}

      {/* Account */}
      <Card title="Freelancer account" subtitle={acct?.error ? acct.error : 'What clients see when they open your bid'} right={prof?.membership && <span className="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200">{prof.membership} membership</span>}>
        {!acct?.connected && <p className="text-sm text-slate-600 dark:text-slate-300">Freelancer is not connected. <Link to="/settings" className="underline">Connect it in Settings</Link>.</p>}
        {acct?.connected && (
          <div className="grid lg:grid-cols-3 gap-5">
            <div className="flex items-start gap-3">
              {prof?.avatar ? <img src={prof.avatar.startsWith('//') ? `https:${prof.avatar}` : prof.avatar} alt="" className="w-14 h-14 rounded-full object-cover" /> : <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-navy-700" />}
              <div className="min-w-0">
                <p className="font-semibold text-navy-950 dark:text-white truncate">{prof?.displayName || prof?.username || 'Freelancer account'}</p>
                {prof?.username && <p className="text-xs text-slate-500 dark:text-slate-400">@{prof.username}{prof?.country ? ` · ${prof.country}` : ''}</p>}
                {prof?.tagline && <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">{prof.tagline}</p>}
                <div className="mt-2"><Stars value={rep?.rating} /> {rep?.reviews !== null && rep?.reviews !== undefined && <span className="text-xs text-slate-500 dark:text-slate-400">({n(rep.reviews)} reviews)</span>}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge ok={prof?.verified?.payment}>Payment</Badge>
                  <Badge ok={prof?.verified?.identity}>Identity</Badge>
                  <Badge ok={prof?.verified?.phone}>Phone</Badge>
                  <Badge ok={prof?.verified?.email}>Email</Badge>
                  <Badge ok={prof?.verified?.profileComplete}>Profile complete</Badge>
                  {prof?.verified?.preferredFreelancer && <Badge ok>Preferred Freelancer</Badge>}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                ['Bids left', acct.bids ? (acct.bids.unlimited ? 'unlimited' : `${n(acct.bids.remaining)}${acct.bids.limit ? ` / ${n(acct.bids.limit)}` : ''}`) : '—'],
                ['Jobs completed', n(rep?.completeJobs)],
                ['Completion rate', pctText(rep?.completionRate)],
                ['On budget', pctText(rep?.onBudget)],
                ['On time', pctText(rep?.onTime)],
                ['Rehire rate', pctText(rep?.rehireRate)],
                ['Earnings score', rep?.earningsScore !== null && rep?.earningsScore !== undefined ? n(rep.earningsScore, 1) : '—'],
                ['Hourly rate', prof?.hourlyRate ? `${prof.hourlyRate} ${prof.currency || 'USD'}/h` : '—'],
                ['Member since', prof?.registrationDate ? format(new Date(prof.registrationDate), 'MMM yyyy') : '—'],
                ['Last 3 months', rep?.last3Months?.reviews ? `${rep.last3Months.rating ?? '—'} ★ · ${rep.last3Months.reviews} reviews` : 'no reviews'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 border-b border-slate-100 dark:border-white/5 py-1">
                  <span className="text-slate-500 dark:text-slate-400">{k}</span>
                  <span className="font-medium text-navy-950 dark:text-white tabular-nums text-right">{v}</span>
                </div>
              ))}
            </div>
            <div className="text-sm">
              {rep?.projectStats && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(rep.projectStats).filter(([, v]) => typeof v === 'number').map(([k, v]) => (
                    <span key={k} className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-white/5 text-xs text-slate-700 dark:text-slate-200">{k.replace(/_/g, ' ')}: <b>{v}</b></span>
                  ))}
                </div>
              )}
              {rep?.topJobs?.length > 0 && (
                <>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Skills you have been hired for</p>
                  <div className="flex flex-wrap gap-1">
                    {rep.topJobs.map((j) => <span key={j.name} className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs">{j.name} · {j.count}</span>)}
                  </div>
                </>
              )}
              {prof?.skills?.length > 0 && (
                <>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-3 mb-1">Skills on your profile ({prof.skills.length})</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3">{prof.skills.join(', ')}</p>
                </>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* KPIs */}
      {t && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Kpi label="Bids sent" value={n(t.sent)} hint={`${n(t.sentPerDay, 1)} per day`} />
          <Kpi label="Client replied" value={n(t.replied)} hint={t.medianReplyMin ? `median wait ${minutes(t.medianReplyMin)}` : 'first message from the client'} />
          <Kpi label="Reply rate" value={pctText(t.replyRate)} hint="replied ÷ sent" tone={t.replyRate === null ? undefined : t.replyRate >= 10 ? 'good' : t.replyRate >= 4 ? undefined : 'warn'} />
          <Kpi label="Won" value={n(t.won)} hint={t.wonValueUsd ? `${usd(t.wonValueUsd)} in USD bids` : 'awarded by Freelancer'} tone="good" />
          <Kpi label="Win rate" value={pctText(t.winRate)} hint={`won ÷ sent · ${n(t.lost)} lost · ${n(t.open)} open`} tone={t.winRate === null ? undefined : t.winRate >= 3 ? 'good' : t.winRate >= 1 ? undefined : 'warn'} />
          <Kpi label="Errors" value={n(t.errored)} hint={`${pctText(t.errorRate)} of all attempts`} tone={t.errorRate > 10 ? 'bad' : undefined} />
          <Kpi label="Median bid" value={usd(t.medianBidUsd)} hint={t.medianWonBidUsd ? `won bids: ${usd(t.medianWonBidUsd)}` : 'USD projects only'} />
          <Kpi label="Response speed" value={minutes(t.medianSpeedMin)} hint={`median, ${n(t.speedSamples)} bids`} />
          <Kpi label="Follow-ups sent" value={n(t.followUpsSent)} hint={t.followUpsSent ? 'see the follow-up table below' : 'Settings → Winning more'} />
          <Kpi label="Clients" value={n(data.clients?.count)} hint={`${n(data.clients?.repeat)} repeat`} />
        </div>
      )}

      {/* Timeline + funnel */}
      <div className="grid lg:grid-cols-3 gap-5">
        <Card title="Bids over time" subtitle="Sent, replied and won per day" className="lg:col-span-2">
          {b?.series?.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={b.series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} stroke={c.axis} tick={{ fontSize: 11 }} interval={tickEvery} />
                <YAxis stroke={c.axis} tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip labelFormatter={fmtDay} contentStyle={tooltipStyle(dark)} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="sent" name="Sent" fill={c.sent} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                <Bar dataKey="replied" name="Replied" fill={c.replied} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                <Bar dataKey="won" name="Won" fill={c.won} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                <Line type="monotone" dataKey="errors" name="Errors" stroke={c.errors} strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-500 dark:text-slate-400">No bids in this period</p>}
        </Card>
        <Card title="Funnel" subtitle="From projects found to projects won">
          <Funnel funnel={b?.funnel} />
        </Card>
      </div>

      {/* When */}
      <div className="grid lg:grid-cols-3 gap-5">
        <Card title="Hour of day" subtitle="Bids sent and won by the hour they were placed (your clock)" className="lg:col-span-2">
          {b?.hours && (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={b.hours} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                <XAxis dataKey="hour" stroke={c.axis} tick={{ fontSize: 11 }} tickFormatter={(h) => `${h}h`} interval={1} />
                <YAxis stroke={c.axis} tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle(dark)} labelFormatter={(h) => `${h}:00–${h}:59`} formatter={(v, name, p) => name === 'Sent' && p.payload.replyRate !== null ? [`${v} (reply rate ${p.payload.replyRate}%)`, name] : [v, name]} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="sent" name="Sent" fill={c.sent} radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
                <Bar dataKey="replied" name="Replied" fill={c.replied} radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
                <Bar dataKey="won" name="Won" fill={c.won} radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Day of week"><RateTable rows={b?.weekdays} label="Day" /></Card>
      </div>

      {/* Freelancer-side levers + why projects were skipped */}
      <div className="grid lg:grid-cols-2 gap-5">
        {acct?.checklist && (
          <Card title="Freelancer profile checklist" subtitle={`${acct.checklist.done} of ${acct.checklist.known} done · these move win rate more than any bidding setting`}>
            <Checklist checklist={acct.checklist} />
          </Card>
        )}
        <Card title="Why projects were skipped" subtitle="What the automatic runs decided about the projects found in this period">
          {b?.decisions?.length ? (
            <ul className="space-y-1.5 text-sm">
              {b.decisions.map((d) => (
                <li key={`${d.decision}-${d.reason}`} className="flex justify-between gap-3 border-b border-slate-100 dark:border-white/5 py-1">
                  <span className="text-slate-700 dark:text-slate-200 truncate">{DECISION_TEXT[d.reason] || d.reason || d.decision}</span>
                  <span className="tabular-nums text-navy-950 dark:text-white">{n(d.count)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500 dark:text-slate-400">No decisions recorded yet. Each automatic run now records why every project found was or was not bid on; open a project on the Projects page to read it.</p>}
        </Card>
      </div>

      {/* Who / what */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Client score" subtitle="Payment verified, reviews, hire history, account age, bids on the project"><RateTable rows={b?.clientScores} label="Client score" /></Card>
        <Card title="Client kind" subtitle="Whether the client could pay and had hired before"><RateTable rows={b?.clientKinds} label="Client" /></Card>
        <Card title="Client country" subtitle="Top countries by bids sent"><RateTable rows={b?.countries} label="Country" /></Card>
        <Card title="Bid profile" subtitle="Each profile is a proposal variant: compare reply rates to pick the better prompt"><RateTable rows={b?.profiles} label="Profile" /></Card>
        <Card title="Project budget" subtitle="Upper budget of the project when bid"><RateTable rows={b?.budgets} label="Budget" /></Card>
        <Card title="Competition" subtitle="Bids already on the project when BidPilot bid"><RateTable rows={b?.competition} label="Other bids" /></Card>
        <Card title="Response speed" subtitle="Time from the project being posted to the bid"><RateTable rows={b?.speed} label="Speed" /></Card>
        <Card title="AI relevance score" subtitle="How the score given to the project relates to replies and wins"><RateTable rows={b?.scores} label="Score" /></Card>
        <Card title="Follow-up" subtitle="Bids with and without the follow-up message"><RateTable rows={b?.followUps} label="Follow-up" empty="No follow-ups sent yet (Settings → Auto-Bidding → Winning more)" /></Card>
        <Card title="Project type and currency">
          <div className="space-y-4">
            <RateTable rows={b?.types} label="Type" />
            <RateTable rows={b?.currencies} label="Currency" />
          </div>
        </Card>
        <Card title="Why bids failed" subtitle="Errors in this period, grouped">
          {b?.errors?.length ? (
            <ul className="space-y-1.5 text-sm">
              {b.errors.map((e) => (
                <li key={e.reason} className="flex justify-between gap-3 border-b border-slate-100 dark:border-white/5 py-1">
                  <span className="text-slate-700 dark:text-slate-200 truncate">{e.reason}</span>
                  <span className="tabular-nums text-navy-950 dark:text-white">{n(e.count)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500 dark:text-slate-400">No failed bids in this period</p>}
        </Card>
      </div>

      {data && <p className="text-[11px] text-slate-400 text-right">Updated {timeAgo(new Date(data.generatedAt))} · win rates on fewer than 10 bids are greyed out</p>}
    </div>
  )
}
