// One client conversation, all on one card: the messages, the project (title,
// full description, budget/rate, duration…), the client and your bid. One
// "Copy all" button puts everything on the clipboard as plain text, ready to
// paste into an AI chatbot.
import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getConversation } from '../services/conversations'
import { timeAgo, formatAmount } from '../utils/formatters'
import { countryFlag } from '../utils/flags'
import CopyButton from '../components/CopyButton'
import Avatar from '../components/Avatar'

const errText = (e) => e?.response?.data?.error || e?.message || 'Something went wrong'
const money = (v, cur) => (v || v === 0 ? formatAmount(v, cur || 'USD') : '—')
const when = (d) => (d ? new Date(d).toLocaleString() : '')
const day = (d) => (d ? new Date(d).toLocaleDateString() : '—')
const yesNo = (v) => (v === true ? 'yes' : v === false ? 'no' : 'unknown')

function budgetText(p) {
  if (!p) return '—'
  const unit = p.type === 'hourly' ? '/hr' : ''
  if (p.budgetMin && p.budgetMax) return `${money(p.budgetMin, p.currency)} – ${money(p.budgetMax, p.currency)}${unit}`
  if (p.budgetMax || p.budgetMin) return `${money(p.budgetMax || p.budgetMin, p.currency)}${unit}`
  return '—'
}
function typeText(p) {
  return p?.type === 'hourly' ? 'Hourly' : p?.type === 'fixed' ? 'Fixed price' : (p?.type || '—')
}
function workloadText(p) {
  const h = p?.hourly
  if (!h) return null
  const parts = []
  if (h.hoursPerWeek) parts.push(`${h.hoursPerWeek} h/${h.interval || 'week'}`)
  if (h.duration) parts.push(String(h.duration).replace(/_/g, ' ').toLowerCase())
  return parts.join(' · ') || null
}
function statusText(p) {
  return (p?.frontendStatus || p?.status || '').replace(/_/g, ' ') || '—'
}
function bidPrice(bid, project) {
  if (!bid?.amount) return '—'
  return `${money(bid.amount, project?.currency)}${project?.type === 'hourly' ? '/hr' : ''}`
}
function locationText(c) {
  return [c.city, c.countryName || c.country].filter(Boolean).join(', ') || '—'
}

// Everything as plain text, for pasting into an AI chatbot.
function allText(d) {
  const c = d.client || {}
  const p = d.project
  const b = d.bid
  const clientName = c.name || c.username || `Client #${c.id}`
  const out = []

  out.push('=== PROJECT ===')
  if (p) {
    out.push(`Title: ${p.title}`)
    out.push(`Link: ${p.url}`)
    out.push(`Type: ${typeText(p)}`)
    out.push(`${p.type === 'hourly' ? 'Rate' : 'Budget'}: ${budgetText(p)}`)
    if (workloadText(p)) out.push(`Workload / duration: ${workloadText(p)}`)
    out.push(`Status: ${statusText(p)}`)
    out.push(`Bids: ${p.bidCount ?? '—'}${p.bidAvg ? ` (average ${money(Math.round(p.bidAvg), p.currency)})` : ''}`)
    out.push(`Posted: ${when(p.postedAt) || '—'}`)
    if (p.skills?.length) out.push(`Skills: ${p.skills.join(', ')}`)
    out.push('')
    out.push('Description:')
    out.push(p.description || '—')
  } else {
    out.push(`Project #${d.projectId} (no longer shown on Freelancer)`)
  }

  out.push('')
  out.push('=== CLIENT ===')
  out.push(`Name: ${clientName}${c.username && c.username !== clientName ? ` (@${c.username})` : ''}`)
  out.push(`Location: ${locationText(c)}`)
  out.push(`Member since: ${day(c.registeredAt)}`)
  out.push(`Payment verified: ${yesNo(c.paymentVerified)} · Deposit made: ${yesNo(c.depositMade)} · Email: ${yesNo(c.emailVerified)} · Phone: ${yesNo(c.phoneVerified)} · Identity: ${yesNo(c.identityVerified)}`)
  out.push(`Reviews: ${c.reviews || 0}${c.rating ? ` (rating ${c.rating.toFixed(1)}/5)` : ''}`)
  out.push(`Projects completed: ${c.projectsPosted ? `${c.projectsCompleted ?? 0} of ${c.projectsPosted} posted` : '—'}`)
  if (c.timezone) out.push(`Time zone: ${c.timezone}`)

  out.push('')
  out.push('=== MY BID ===')
  if (b) {
    out.push(`${p?.type === 'hourly' ? 'Rate' : 'Price'}: ${bidPrice(b, p)}`)
    out.push(`Delivery: ${b.periodDays ? `${b.periodDays} day${b.periodDays === 1 ? '' : 's'}` : '—'}`)
    out.push(`Placed: ${when(b.placedAt) || '—'}`)
    out.push(`Status: ${b.awardStatus ? String(b.awardStatus).replace(/_/g, ' ') : 'open'}`)
    out.push('')
    out.push('Proposal:')
    out.push(b.text || '—')
  } else {
    out.push('No bid found on this project.')
  }

  out.push('')
  out.push('=== CONVERSATION (oldest first) ===')
  for (const m of d.conversation || []) out.push(`[${when(m.at)}] ${m.fromClient ? clientName : 'Me'}: ${m.text}`)

  return out.join('\n').trim()
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function Block({ title, children }) {
  return (
    <div className="px-5 py-5 border-t border-slate-100 dark:border-white/5 first:border-t-0">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">{title}</h2>
      {children}
    </div>
  )
}

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-sm font-medium text-navy-950 dark:text-white break-words">{children}</p>
    </div>
  )
}

function Check({ ok, children }) {
  const tone = ok === true ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
  return <span className={`inline-flex items-center gap-1 text-xs ${tone}`}>{ok === true ? '✓' : '○'} {children}</span>
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ConversationPage() {
  const { threadId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true)
    setError(null)
    try { setData(await getConversation(threadId, refresh)) } catch (e) { setError(errText(e)) } finally { setLoading(false); setRefreshing(false) }
  }, [threadId])
  useEffect(() => { load(false) }, [load])

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/messages'))
  const backLink = (
    <button type="button" onClick={back} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy-950 dark:hover:text-white">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
      Messages
    </button>
  )

  if (loading) return <div className="max-w-4xl mx-auto"><p className="text-sm text-slate-500 p-6">Reading the conversation from Freelancer…</p></div>
  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-3">
        {backLink}
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-sm text-red-700 dark:text-red-300">{error}</div>
      </div>
    )
  }

  const c = data.client || {}
  const p = data.project
  const b = data.bid
  const clientName = c.name || c.username || `Client #${c.id}`

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {backLink}

      <section className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/8 shadow-sm">
        {/* Title + the one copy button */}
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-slate-100 dark:border-white/5">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-navy-950 dark:text-white break-words">{p?.title || `Project #${data.projectId}`}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              Conversation with <span className="font-semibold text-navy-950 dark:text-white">{clientName}</span>
              {data.waitingOnYou && <span className="ml-2 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">waiting on you</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton text={() => allText(data)} size="md">Copy all</CopyButton>
            <button type="button" onClick={() => load(true)} disabled={refreshing} className="px-3 py-2 rounded-lg text-sm font-medium border border-slate-300 dark:border-white/10 bg-white dark:bg-navy-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50">
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <a href={data.threadUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-lg text-sm font-medium bg-navy-950 dark:bg-white text-white dark:text-navy-950 hover:opacity-90">Reply on Freelancer ↗</a>
          </div>
        </div>

        {/* Conversation */}
        <Block title={`Messages · ${data.conversation.length}`}>
          <div className="space-y-2.5">
            {data.conversation.map((m) => (
              <div key={m.id} className={`flex ${m.fromClient ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 ${m.fromClient ? 'bg-slate-100 dark:bg-navy-900 text-navy-950 dark:text-white rounded-bl-sm' : 'bg-emerald-600 text-white rounded-br-sm'}`}>
                  <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>
                  {m.attachments?.length > 0 && <p className="text-[11px] mt-1 opacity-80">📎 {m.attachments.join(', ')}</p>}
                  <p className={`text-[10px] mt-1 ${m.fromClient ? 'text-slate-400' : 'text-emerald-100'}`} title={when(m.at)}>{m.fromClient ? clientName : 'You'} · {m.at ? timeAgo(m.at) : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </Block>

        {/* Project */}
        <Block title="Project">
          {!p ? <p className="text-sm text-slate-500">Freelancer no longer shows this project (it may have been deleted).</p> : (
            <div className="space-y-4">
              <div>
                <p className="text-base font-semibold text-navy-950 dark:text-white break-words">{p.title}</p>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-400 hover:text-navy-950 dark:hover:text-white break-all">{p.url} ↗</a>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Fact label={p.type === 'hourly' ? 'Rate' : 'Budget'}>{budgetText(p)}</Fact>
                <Fact label="Type">{typeText(p)}</Fact>
                <Fact label="Workload / duration">{workloadText(p) || '—'}</Fact>
                <Fact label="Status">{statusText(p)}</Fact>
                <Fact label="Bids">{p.bidCount ?? '—'}{p.bidAvg ? ` · avg ${money(Math.round(p.bidAvg), p.currency)}` : ''}</Fact>
                <Fact label="Posted">{p.postedAt ? `${day(p.postedAt)} (${timeAgo(p.postedAt)})` : '—'}</Fact>
              </div>
              {p.skills?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {p.skills.map((s) => <span key={s} className="px-2 py-0.5 rounded-md text-xs bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300">{s}</span>)}
                </div>
              )}
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">Description</p>
                <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words">{p.description || '—'}</p>
              </div>
              {p.fromLocalCopy && <p className="text-[11px] text-slate-400">From BidPilot's saved copy; Freelancer no longer returns this project.</p>}
            </div>
          )}
        </Block>

        {/* Client */}
        <Block title="Client">
          <div className="flex items-center gap-3 mb-4">
            <Avatar src={c.avatar} name={clientName} size="w-12 h-12" />
            <div className="min-w-0">
              <p className="font-semibold text-navy-950 dark:text-white truncate">
                {clientName}
                {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs font-normal text-slate-400 hover:text-navy-950 dark:hover:text-white">profile ↗</a>}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {c.username && c.username !== clientName ? `@${c.username} · ` : ''}{countryFlag(c.country)} {locationText(c)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Fact label="Member since">{day(c.registeredAt)}</Fact>
            <Fact label="Reviews">{c.reviews ? `${c.reviews}${c.rating ? ` · ★ ${c.rating.toFixed(1)}` : ''}` : 'none'}</Fact>
            <Fact label="Projects completed">{c.projectsPosted ? `${c.projectsCompleted ?? 0} of ${c.projectsPosted}` : '—'}</Fact>
            <Fact label="Time zone">{c.timezone || '—'}</Fact>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4">
            <Check ok={c.paymentVerified}>payment verified</Check>
            <Check ok={c.depositMade}>deposit made</Check>
            <Check ok={c.emailVerified}>email</Check>
            <Check ok={c.phoneVerified}>phone</Check>
            <Check ok={c.identityVerified}>identity</Check>
          </div>
        </Block>

        {/* Your bid */}
        <Block title="Your bid">
          {!b ? <p className="text-sm text-slate-500">No bid of yours found on this project.</p> : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Fact label={p?.type === 'hourly' ? 'Your rate' : 'Your price'}>{bidPrice(b, p)}</Fact>
                <Fact label="Delivery">{b.periodDays ? `${b.periodDays} day${b.periodDays === 1 ? '' : 's'}` : '—'}</Fact>
                <Fact label="Placed">{b.placedAt ? `${day(b.placedAt)} (${timeAgo(b.placedAt)})` : '—'}</Fact>
                <Fact label="Status">{b.awardStatus ? String(b.awardStatus).replace(/_/g, ' ') : 'open'}</Fact>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">Proposal</p>
                <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words">{b.text || '—'}</p>
              </div>
            </div>
          )}
        </Block>
      </section>
    </div>
  )
}
