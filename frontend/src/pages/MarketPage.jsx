import { useState, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { timeAgo, formatAmount, formatBudget } from '../utils/formatters'
import {
  getWinningBids, syncWinningBids, getWinningBidStudy, runWinningBidStudy,
  getTopClients, getClientHistory, getClientProjectBids, getClientStudy, runClientStudy,
} from '../services/insights'

const CARD = 'bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50'
const BTN = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60'
const BTN_PRIMARY = `${BTN} text-white bg-navy-950 hover:bg-navy-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 shadow-sm`
const BTN_SOFT = `${BTN} bg-slate-100 dark:bg-navy-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-navy-600`

const n = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: d }))
const pctText = (v) => (v === null || v === undefined ? '—' : `${v}%`)
const errText = (e) => e?.response?.data?.error || e?.message || 'Something went wrong'
const flag = (code) => (code && code.length === 2 && code !== 'EU' ? String.fromCodePoint(0x1F1E6 - 65 + code.charCodeAt(0), 0x1F1E6 - 65 + code.charCodeAt(1)) : '')

function Spinner() {
  return <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" /></svg>
}

function Kpi({ label, value, hint }) {
  return (
    <div className={`${CARD} px-4 py-3`} title={hint}>
      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</p>
      <p className="text-xl font-semibold mt-0.5 text-navy-950 dark:text-white">{value}</p>
      {hint && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{hint}</p>}
    </div>
  )
}

function Stars({ value, reviews }) {
  if (value === null || value === undefined) return <span className="text-slate-400">no rating</span>
  return <span title={`${value} out of 5`}><span className="text-amber-400">★</span> {Number(value).toFixed(1)}{reviews !== null && reviews !== undefined ? <span className="text-slate-400"> ({reviews})</span> : null}</span>
}

// ── Winning bids ─────────────────────────────────────────────────────────────
function WinningBidStudy({ report, createdAt, model }) {
  if (!report) return null
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start gap-4">
        {typeof report.score === 'number' && (
          <div className="shrink-0 w-16 h-16 rounded-full border-4 border-emerald-500 flex items-center justify-center text-lg font-bold text-navy-950 dark:text-white" title="How competitive our bids are against the winners">{report.score}</div>
        )}
        <div>
          <p className="text-base font-semibold text-navy-950 dark:text-white">{report.headline}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{createdAt ? timeAgo(createdAt) : ''}{model ? ` · ${model}` : ''}</p>
        </div>
      </div>
      {report.actions?.length > 0 && (
        <ol className="space-y-2">
          {report.actions.map((a, i) => (
            <li key={i} className="p-3 rounded-lg bg-slate-50 dark:bg-navy-900/50 border border-slate-200 dark:border-white/8">
              <p className="font-semibold text-navy-950 dark:text-white">{a.priority ?? i + 1}. {a.title}</p>
              {a.where && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{a.where}</p>}
              {a.change && <p className="mt-1 text-slate-800 dark:text-slate-100">{a.change}</p>}
              {a.why && <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">Why: {a.why}</p>}
              {a.expected && <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">Expected: {a.expected}</p>}
            </li>
          ))}
        </ol>
      )}
      <div className="grid md:grid-cols-3 gap-3">
        {report.pricing && <div className="p-3 rounded-lg border border-slate-200 dark:border-white/8"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Pricing</p><p className="text-slate-700 dark:text-slate-200">{report.pricing.finding}</p>{report.pricing.change && <p className="mt-1 font-medium text-navy-950 dark:text-white">{report.pricing.change}</p>}</div>}
        {report.proposal && <div className="p-3 rounded-lg border border-slate-200 dark:border-white/8"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Proposal text</p><p className="text-slate-700 dark:text-slate-200">{report.proposal.finding}</p>{report.proposal.promptChanges?.length > 0 && <ul className="mt-1 list-disc pl-4 text-slate-700 dark:text-slate-200">{report.proposal.promptChanges.map((c, i) => <li key={i}>{c}</li>)}</ul>}</div>}
        {report.profile && <div className="p-3 rounded-lg border border-slate-200 dark:border-white/8"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Profile</p><p className="text-slate-700 dark:text-slate-200">{report.profile.finding}</p>{report.profile.actions?.length > 0 && <ul className="mt-1 list-disc pl-4 text-slate-700 dark:text-slate-200">{report.profile.actions.map((c, i) => <li key={i}>{c}</li>)}</ul>}</div>}
      </div>
      {report.proposal?.rewrite && (
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-navy-900/50 border border-slate-200 dark:border-white/8 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Opening lines, side by side{report.proposal.rewrite.projectTitle ? ` · ${report.proposal.rewrite.projectTitle}` : ''}</p>
          {report.proposal.rewrite.winnerOpening && <p><span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Winner: </span><span className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{report.proposal.rewrite.winnerOpening}</span></p>}
          {report.proposal.rewrite.ourOpening && <p><span className="text-xs font-semibold text-slate-500">Ours: </span><span className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{report.proposal.rewrite.ourOpening}</span></p>}
          {report.proposal.rewrite.suggestedOpening && <p><span className="text-xs font-semibold text-navy-700 dark:text-emerald-300">Suggested: </span><span className="text-navy-950 dark:text-white whitespace-pre-wrap">{report.proposal.rewrite.suggestedOpening}</span></p>}
        </div>
      )}
      {report.patterns?.length > 0 && (
        <ul className="space-y-1">
          {report.patterns.map((p, i) => <li key={i} className="flex gap-2"><span className={`shrink-0 mt-1 w-2 h-2 rounded-full ${p.impact === 'high' ? 'bg-red-500' : p.impact === 'medium' ? 'bg-amber-500' : 'bg-slate-400'}`} /><span><span className="font-medium text-navy-950 dark:text-white">{p.title}</span>{p.evidence && <span className="text-slate-600 dark:text-slate-300"> — {p.evidence}</span>}</span></li>)}
        </ul>
      )}
    </div>
  )
}

function WinningBidsTab() {
  const [period, setPeriod] = useState('30d')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [study, setStudy] = useState(null)
  const [studying, setStudying] = useState(false)
  const [studyError, setStudyError] = useState(null)
  const [open, setOpen] = useState(null)

  const load = useCallback(async (p) => {
    setLoading(true); setError(null)
    try { setData(await getWinningBids(p)) } catch (e) { setError(errText(e)) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(period) }, [period, load])
  useEffect(() => { getWinningBidStudy().then(setStudy).catch(() => {}) }, [])

  async function handleSync() {
    setSyncing(true); setSyncMsg(null)
    try {
      const r = await syncWinningBids()
      const parts = [`${r.captured} winning bid${r.captured === 1 ? '' : 's'} fetched from ${r.checked} decided project${r.checked === 1 ? '' : 's'}`]
      if (r.noWinner) parts.push(`${r.noWinner} without a visible winner`)
      if (r.remaining) parts.push(`${r.remaining} more to fetch — click again`)
      if (r.checked === 0 && !r.remaining) parts.push('nothing new: every decided project among your last 500 bids already has its winner, or none is decided yet')
      const failed = r.errors?.length ? ` · ${r.errors.length} failed: ${r.errors[0]}` : ''
      setSyncMsg({ text: parts.join(' · ') + failed, error: !!r.errors?.length && r.captured === 0 })
      await load(period)
    } catch (e) { setSyncMsg({ text: errText(e), error: true }) } finally { setSyncing(false) }
  }
  async function handleStudy() {
    setStudying(true); setStudyError(null)
    try { setStudy(await runWinningBidStudy(period)) } catch (e) { setStudyError(errText(e)) } finally { setStudying(false) }
  }

  const s = data?.stats
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <p className="text-sm text-slate-600 dark:text-slate-300">The bid that won each project you bid on, next to yours. Winners are read from Freelancer when a project is decided; the button fetches any still missing.</p>
        <div className="flex items-center gap-2">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-navy-900 dark:text-white">
            <option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="180d">Last 180 days</option><option value="all">All time</option>
          </select>
          <button onClick={handleSync} disabled={syncing || studying} className={BTN_SOFT}>{syncing ? <Spinner /> : null}{syncing ? 'Fetching from Freelancer…' : 'Fetch winning bids'}</button>
          <button onClick={handleStudy} disabled={studying || syncing} className={BTN_PRIMARY}>{studying ? <Spinner /> : '✦'}{studying ? 'Studying…' : 'AI: what wins'}</button>
        </div>
      </div>
      {syncing && <p className="text-xs text-slate-600 dark:text-slate-300 inline-flex items-center gap-2"><Spinner /> Reading the bids on each decided project from Freelancer (one request per project, up to 50 per click)…</p>}
      {syncMsg && !syncing && <p className={`text-xs ${syncMsg.error ? 'text-red-600 dark:text-red-400 font-medium' : 'text-slate-600 dark:text-slate-300'}`}>{syncMsg.text}</p>}
      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-sm text-red-700 dark:text-red-300">{error}</div>}

      {(study?.report || studying || studyError) && (
        <section className={`${CARD} p-5`}>
          <h2 className="text-base font-semibold text-navy-950 dark:text-white mb-1">What the winners did differently</h2>
          {studyError && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{studyError}</p>}
          {studying && !study?.report && <p className="text-sm text-slate-600 dark:text-slate-300">Comparing your bids with the winning ones. About half a minute.</p>}
          <WinningBidStudy report={study?.report} createdAt={study?.createdAt} model={study?.model} />
        </section>
      )}

      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi label="Decided projects" value={n(s.total)} hint={`${n(s.lost)} lost · ${n(s.won)} won`} />
          <Kpi label="Winner was cheaper" value={pctText(s.winnerCheaperPct)} hint={s.medianRatio ? `winner bid ÷ ours, median ${s.medianRatio}` : 'of lost projects'} />
          <Kpi label="Median winner / ours" value={`${s.medianWinnerAmountUsd ? `$${n(s.medianWinnerAmountUsd)}` : '—'} / ${s.medianOurAmountUsd ? `$${n(s.medianOurAmountUsd)}` : '—'}`} hint="USD projects" />
          <Kpi label="Delivery promised" value={`${s.medianWinnerPeriod ?? '—'} d / ${s.medianOurPeriod ?? '—'} d`} hint="winner / ours, median" />
          <Kpi label="Winner's reviews" value={n(s.medianWinnerReviews)} hint={s.medianWinnerRating ? `median · rated ${s.medianWinnerRating}` : 'median'} />
          <Kpi label="Winner bid first" value={s.bidSpeed?.compared ? pctText(Math.round((s.bidSpeed.winnerBeforeUs / s.bidSpeed.compared) * 100)) : '—'} hint={`${n(s.sealedPct)}% of winners sealed`} />
        </div>
      )}

      <section className={`${CARD} overflow-hidden`}>
        {loading ? <p className="p-5 text-sm text-slate-500">Loading…</p> : !data?.items?.length ? (
          <div className="p-6 text-sm text-slate-600 dark:text-slate-300">
            No winning bids stored yet. They appear once a project you bid on is awarded (the outcome check runs every 30 minutes); click <b>Fetch winning bids</b> to read them now for projects already marked lost or won on the <Link to="/bids" className="underline">Bid History</Link> page.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-navy-900/40 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="text-left font-medium px-4 py-2">Project</th>
                <th className="text-right font-medium px-3 py-2">Our bid</th>
                <th className="text-right font-medium px-3 py-2">Winning bid</th>
                <th className="text-left font-medium px-3 py-2">Winner</th>
                <th className="text-right font-medium px-3 py-2">Bids</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <>
                  <tr key={i.projectId} className="border-t border-slate-100 dark:border-white/5 hover:bg-slate-50/60 dark:hover:bg-white/[0.02] cursor-pointer" onClick={() => setOpen(open === i.projectId ? null : i.projectId)}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-navy-950 dark:text-white truncate max-w-md">{i.title}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatBudget(i.budgetMin, i.budgetMax, i.currency)} · {flag(i.clientCountry)} {i.clientCountry || ''} · {i.postedAt ? `posted ${timeAgo(i.postedAt)}` : ''}{i.relevanceScore != null ? ` · match ${i.relevanceScore}%` : ''}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{i.our ? <>{formatAmount(i.our.amount, i.currency)}<span className="block text-[11px] text-slate-400">{i.our.period} d{i.our.replied ? ' · replied' : ''}</span></> : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className={`font-semibold ${i.winner.isMine ? 'text-emerald-700 dark:text-emerald-400' : 'text-navy-950 dark:text-white'}`}>{i.winner.amount ? formatAmount(i.winner.amount, i.currency) : '—'}</span>
                      <span className="block text-[11px] text-slate-400">{i.winner.period ? `${i.winner.period} d` : ''}{i.ratio && !i.winner.isMine ? ` · ${i.ratio < 1 ? `${Math.round((1 - i.ratio) * 100)}% cheaper` : i.ratio > 1 ? `${Math.round((i.ratio - 1) * 100)}% higher` : 'same'}` : ''}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200">
                      {i.winner.isMine ? <span className="font-semibold text-emerald-700 dark:text-emerald-400">🏆 You</span> : (
                        <>
                          <span className="font-medium">{flag(i.winner.country)} {i.winner.name || i.winner.username || `#${i.winner.bidderId}`}</span>
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400"><Stars value={i.winner.rating} reviews={i.winner.reviews} />{i.winner.hourlyRate ? ` · ${i.winner.hourlyRate}/h` : ''}{i.winner.sealed ? ' · sealed' : ''}</span>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{n(i.totalBids)}{i.avgBid ? <span className="block text-[11px] text-slate-400">avg {formatAmount(Math.round(i.avgBid), i.currency)}</span> : null}</td>
                    <td className="px-2 py-2.5 text-slate-400">{open === i.projectId ? '▴' : '▾'}</td>
                  </tr>
                  {open === i.projectId && (
                    <tr key={`${i.projectId}-open`} className="bg-slate-50/70 dark:bg-navy-900/40">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="grid md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-1">Winning bid{i.winner.isMine ? ' (yours)' : ''}</p>
                            <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-100">{i.winner.description || (i.winner.sealed ? 'Sealed bid — the text is not visible.' : 'Text not available.')}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Our bid</p>
                            <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{i.our?.proposal || '—'}</p>
                          </div>
                        </div>
                        <p className="mt-2 text-[11px] text-slate-500"><a href={`https://www.freelancer.com/projects/${i.freelancerProjectId}`} target="_blank" rel="noopener noreferrer" className="underline">Open project on Freelancer</a></p>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

// ── Client explorer ───────────────────────────────────────────────────────────
function ClientStudy({ report, createdAt, model }) {
  if (!report) return null
  const tone = report.priority === 'high' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : report.priority === 'low' ? 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        {report.priority && <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${tone}`}>{report.priority} priority</span>}
        <p className="font-semibold text-navy-950 dark:text-white">{report.headline}</p>
        <span className="text-xs text-slate-400">{createdAt ? timeAgo(createdAt) : ''}{model ? ` · ${model}` : ''}</span>
      </div>
      {report.pitchOpening && <div className="p-3 rounded-lg bg-slate-50 dark:bg-navy-900/50 border border-slate-200 dark:border-white/8"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Open your next bid to them with</p><p className="whitespace-pre-wrap text-navy-950 dark:text-white">{report.pitchOpening}</p></div>}
      <div className="grid md:grid-cols-2 gap-3">
        {report.howToPitch?.length > 0 && <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">How to pitch</p><ol className="list-decimal pl-4 space-y-0.5 text-slate-700 dark:text-slate-200">{report.howToPitch.map((x, i) => <li key={i}>{x}</li>)}</ol></div>}
        {report.whoTheyPick && <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Whom they pick</p><ul className="space-y-0.5 text-slate-700 dark:text-slate-200">{Object.entries(report.whoTheyPick).filter(([, v]) => v).map(([k, v]) => <li key={k}><span className="font-medium capitalize">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}:</span> {v}</li>)}</ul></div>}
        {report.whatTheyHire?.length > 0 && <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">What they hire</p><ul className="list-disc pl-4 space-y-0.5 text-slate-700 dark:text-slate-200">{report.whatTheyHire.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
        {report.watchOuts?.length > 0 && <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Watch out</p><ul className="list-disc pl-4 space-y-0.5 text-slate-700 dark:text-slate-200">{report.watchOuts.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      </div>
    </div>
  )
}

function ProjectBids({ ownerId, projectId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => { getClientProjectBids(ownerId, projectId).then(setData).catch((e) => setError(errText(e))) }, [ownerId, projectId])
  if (error) return <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
  if (!data) return <p className="text-xs text-slate-500">Loading bids…</p>
  if (!data.bids.length) return <p className="text-xs text-slate-500">No bids visible on this project.</p>
  return (
    <div className="space-y-1.5">
      {data.bids.map((b) => (
        <div key={b.bidId} className={`p-2.5 rounded-lg border text-xs ${b.awarded ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-900/20' : b.isMine ? 'border-blue-300 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-900/20' : 'border-slate-200 dark:border-white/8'}`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {b.awarded && <span className="font-semibold text-emerald-700 dark:text-emerald-400">🏆 awarded</span>}
            {b.isMine && <span className="font-semibold text-blue-700 dark:text-blue-400">you</span>}
            <span className="font-medium text-navy-950 dark:text-white">{flag(b.country)} {b.name || b.username || `#${b.bidderId}`}</span>
            <span className="text-slate-500 dark:text-slate-400"><Stars value={b.rating} reviews={b.reviews} /></span>
            <span className="tabular-nums text-slate-700 dark:text-slate-200">{b.amount ? n(b.amount) : '—'} · {b.period ? `${b.period} d` : ''}</span>
            {b.submittedAt && <span className="text-slate-400">{timeAgo(b.submittedAt)}</span>}
            {b.sealed && <span className="text-slate-400">sealed</span>}
          </div>
          {b.description && <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-200 line-clamp-6">{b.description}</p>}
        </div>
      ))}
    </div>
  )
}

function ClientDetail({ client, onClose }) {
  const [history, setHistory] = useState(null)
  const [error, setError] = useState(null)
  const [openProject, setOpenProject] = useState(null)
  const [study, setStudy] = useState(null)
  const [studying, setStudying] = useState(false)
  const [studyError, setStudyError] = useState(null)

  useEffect(() => {
    setHistory(null); setError(null); setOpenProject(null); setStudy(null); setStudyError(null)
    getClientHistory(client.ownerId).then(setHistory).catch((e) => setError(errText(e)))
    getClientStudy(client.ownerId).then(setStudy).catch(() => {})
  }, [client.ownerId])

  async function handleStudy() {
    setStudying(true); setStudyError(null)
    try { setStudy(await runClientStudy(client.ownerId)) } catch (e) { setStudyError(errText(e)) } finally { setStudying(false) }
  }

  const emp = history?.employer
  const name = emp?.name || emp?.username || client.name || client.username || `Client #${client.ownerId}`
  return (
    <section className={`${CARD} p-5 space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {emp?.avatar ? <img src={emp.avatar.startsWith('//') ? `https:${emp.avatar}` : emp.avatar} alt="" className="w-12 h-12 rounded-full object-cover" /> : <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-navy-700" />}
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-navy-950 dark:text-white truncate">{name} {emp?.url && <a href={emp.url} target="_blank" rel="noopener noreferrer" className="text-xs font-normal text-slate-400 hover:underline">open on Freelancer ↗</a>}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {flag(emp?.country || client.country)} {emp?.country || client.country || ''}{emp?.registeredAt ? ` · member since ${new Date(emp.registeredAt).getFullYear()}` : ''}
              {emp ? ` · ${emp.paymentVerified ? '✓ payment verified' : '○ payment not verified'}` : ''}{emp?.identityVerified ? ' · ✓ identity' : ''}
            </p>
            {emp && <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5"><Stars value={emp.rating} reviews={emp.reviews} /> · {n(emp.projectsComplete)} of {n(emp.projectsAll)} projects completed{emp.onBudget != null ? ` · on budget ${Math.round(emp.onBudget * 100)}%` : ''}{emp.onTime != null ? ` · on time ${Math.round(emp.onTime * 100)}%` : ''}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleStudy} disabled={studying || !history} className={BTN_PRIMARY}>{studying ? <Spinner /> : '✦'}{studying ? 'Studying…' : 'Study with AI'}</button>
          <button onClick={onClose} className={BTN_SOFT}>Close</button>
        </div>
      </div>

      {(study?.report || studying || studyError) && (
        <div className="p-4 rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-900/10">
          {studyError && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{studyError}</p>}
          {studying && !study?.report && <p className="text-sm text-slate-600 dark:text-slate-300">Reading this client's projects and the bids that won them. About half a minute.</p>}
          <ClientStudy report={study?.report} createdAt={study?.createdAt} model={study?.model} />
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!history && !error && <p className="text-sm text-slate-500">Reading project history from Freelancer…</p>}
      {history && (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <span><b>{n(history.summary.posted)}</b> projects seen{history.totalProjects ? ` of ${n(history.totalProjects)} posted` : ''}</span>
            <span><b>{n(history.summary.awarded)}</b> awarded{history.summary.hireRate != null ? ` (${history.summary.hireRate}% hire rate)` : ''}</span>
            {history.summary.medianAwardVsBudget != null && <span>winners paid <b>{Math.round(history.summary.medianAwardVsBudget * 100)}%</b> of the max budget (median)</span>}
            {history.summary.skills?.length > 0 && <span>hires for: {history.summary.skills.map((s) => s.name).join(', ')}</span>}
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/5 border-t border-slate-100 dark:border-white/5">
            {history.projects.map((p) => (
              <div key={p.freelancerProjectId}>
                <button type="button" onClick={() => setOpenProject(openProject === p.freelancerProjectId ? null : p.freelancerProjectId)} className="w-full text-left py-2.5 flex items-start justify-between gap-3 hover:bg-slate-50/60 dark:hover:bg-white/[0.02]">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy-950 dark:text-white truncate">{p.title}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {p.postedAt ? timeAgo(p.postedAt) : ''} · {formatBudget(p.budgetMin, p.budgetMax, p.currency)} · {n(p.bidCount)} bids{p.bidAvg ? ` · avg ${formatAmount(Math.round(p.bidAvg), p.currency)}` : ''}{p.skills.length ? ` · ${p.skills.slice(0, 4).join(', ')}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    {p.awarded ? <span className={`font-semibold ${p.awarded.isMine ? 'text-emerald-700 dark:text-emerald-400' : 'text-navy-950 dark:text-white'}`}>{p.awarded.isMine ? '🏆 awarded to you' : `awarded · ${p.awarded.amount ? formatAmount(p.awarded.amount, p.currency) : ''}`}</span> : <span className="text-slate-500">{p.frontendStatus || p.status}</span>}
                    {p.ourBid && <span className="block text-[11px] text-blue-700 dark:text-blue-400">you bid {formatAmount(p.ourBid.amount, p.currency)} · {p.ourBid.awardStatus || p.ourBid.status}</span>}
                    <span className="block text-[11px] text-slate-400">{openProject === p.freelancerProjectId ? 'hide bids ▴' : 'show bids ▾'}</span>
                  </div>
                </button>
                {openProject === p.freelancerProjectId && <div className="pb-3"><ProjectBids ownerId={client.ownerId} projectId={p.freelancerProjectId} /></div>}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function ClientsTab() {
  const [period, setPeriod] = useState('30d')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)

  const load = useCallback(async (p) => {
    setLoading(true); setError(null)
    try { setData(await getTopClients(p)) } catch (e) { setError(errText(e)) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(period) }, [period, load])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <p className="text-sm text-slate-600 dark:text-slate-300">Employers from the projects BidPilot has seen, best first: payment verified, hire history, rating, and whether they replied to or awarded you. Open one to read their project history and the bids that won, then let the AI say how to pitch them.</p>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-white/10 bg-white dark:bg-navy-900 dark:text-white">
          <option value="30d">Seen in 30 days</option><option value="90d">Seen in 90 days</option><option value="180d">Seen in 180 days</option><option value="all">All time</option>
        </select>
      </div>
      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-sm text-red-700 dark:text-red-300">{error}</div>}
      {selected && <ClientDetail client={selected} onClose={() => setSelected(null)} />}
      <section className={`${CARD} overflow-hidden`}>
        {loading ? <p className="p-5 text-sm text-slate-500">Loading…</p> : !data?.clients?.length ? <p className="p-5 text-sm text-slate-500">No clients seen in this period yet.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-navy-900/40 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr>
                <th className="text-left font-medium px-4 py-2">Client</th>
                <th className="text-right font-medium px-3 py-2">Score</th>
                <th className="text-left font-medium px-3 py-2">Hire history</th>
                <th className="text-left font-medium px-3 py-2">Hires for</th>
                <th className="text-right font-medium px-3 py-2">Seen / bid / replied / won</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.clients.map((c) => (
                <tr key={c.ownerId} className={`border-t border-slate-100 dark:border-white/5 ${selected?.ownerId === c.ownerId ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-navy-950 dark:text-white">{flag(c.country)} {c.name || c.username || `Client #${c.ownerId}`}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{c.paymentVerified === true ? '✓ payment verified' : c.paymentVerified === false ? '○ not verified' : ''}{c.registeredAt ? ` · since ${new Date(c.registeredAt).getFullYear()}` : ''}{c.typicalBudgetUsd ? ` · budgets ≈ $${n(c.typicalBudgetUsd)}` : ''} · last seen {c.lastSeen ? timeAgo(c.lastSeen) : '—'}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right"><span className={`font-semibold px-1.5 py-0.5 rounded ${c.clientScore >= 65 ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : c.clientScore >= 35 ? 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>{n(c.clientScore)}</span></td>
                  <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200"><Stars value={c.rating} reviews={c.reviews} />{c.projectsAll ? <span className="block text-[11px] text-slate-500 dark:text-slate-400">{n(c.projectsComplete)} of {n(c.projectsAll)} projects completed</span> : null}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">{c.skills.join(', ') || '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{n(c.seen)} / {n(c.bids)} / {n(c.replied)} / <span className={c.won ? 'font-semibold text-emerald-700 dark:text-emerald-400' : ''}>{n(c.won)}</span></td>
                  <td className="px-3 py-2.5 text-right"><button onClick={() => setSelected(c)} className={BTN_SOFT}>History &amp; bids</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default function MarketPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'clients' ? 'clients' : 'winning'
  const setTab = (k) => setSearchParams(k === 'clients' ? { tab: 'clients' } : {})
  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-navy-950 dark:text-white">Market</h1>
        <p className="text-sm text-slate-700 dark:text-slate-200 mt-1">Who wins the projects you bid on, and which clients are worth pursuing</p>
      </div>
      <div className="flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-navy-900 w-fit">
        {[['winning', 'Winning bids'], ['clients', 'Top clients']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === k ? 'bg-white dark:bg-navy-700 text-navy-950 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-navy-950 dark:hover:text-white'}`}>{label}</button>
        ))}
      </div>
      {tab === 'winning' ? <WinningBidsTab /> : <ClientsTab />}
    </div>
  )
}
