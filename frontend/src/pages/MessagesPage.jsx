// Messages: every conversation where a client wrote to you, newest first.
// Opening one shows the conversation, the project, the client and your bid
// (ConversationPage).
import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getConversations } from '../services/conversations'
import { timeAgo } from '../utils/formatters'
import Pagination from '../components/Pagination'
import Avatar from '../components/Avatar'
import { usePageParams } from '../hooks/usePageParams'
import { countryFlag } from '../utils/flags'

const errText = (e) => e?.response?.data?.error || e?.message || 'Something went wrong'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'waiting', label: 'Waiting on you' },
  { key: 'unread', label: 'Unread' },
]

const flag = countryFlag

export default function MessagesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = FILTERS.some((f) => f.key === searchParams.get('filter')) ? searchParams.get('filter') : 'all'
  const { page, size, setPage, setSize } = usePageParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true)
    setError(null)
    try { setData(await getConversations(refresh)) } catch (e) { setError(errText(e)) } finally { setLoading(false); setRefreshing(false) }
  }, [])
  useEffect(() => { load(false) }, [load])

  const setFilter = (key) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev)
    if (key === 'all') next.delete('filter'); else next.set('filter', key)
    next.delete('page')
    return next
  }, { replace: true })

  const all = data?.conversations || []
  const rows = all.filter((c) => filter === 'all' || (filter === 'waiting' && c.waitingOnYou) || (filter === 'unread' && c.unread > 0))
  const counts = { all: all.length, waiting: all.filter((c) => c.waitingOnYou).length, unread: all.filter((c) => c.unread > 0).length }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-950 dark:text-white">Messages</h1>
          <p className="text-sm text-slate-700 dark:text-slate-200 mt-1">Clients who wrote to you. Open one for the project, the client and your bid, all copyable in one click.</p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-300 dark:border-white/10 bg-white dark:bg-navy-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
          {refreshing ? 'Checking…' : 'Check for new'}
        </button>
      </div>

      <div className="flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-navy-900 w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === f.key ? 'bg-white dark:bg-navy-700 text-navy-950 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-navy-950 dark:hover:text-white'}`}
          >
            {f.label}{data ? <span className="ml-1.5 text-xs text-slate-400">{counts[f.key]}</span> : null}
          </button>
        ))}
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-sm text-red-700 dark:text-red-300">{error}</div>}

      <section className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/8 shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Reading your conversations from Freelancer…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">{filter === 'all' ? 'No client has written to you yet.' : 'Nothing here.'}</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {rows.slice(page * size, (page + 1) * size).map((c) => (
              <li key={c.threadId}>
                <button
                  type="button"
                  onClick={() => navigate(`/messages/${c.threadId}`)}
                  className="w-full text-left flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                >
                  <Avatar src={c.client.avatar} name={c.client.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm text-navy-950 dark:text-white ${c.unread ? 'font-bold' : 'font-semibold'}`}>{c.client.name || `Client #${c.client.id}`}</span>
                      {(c.client.country || c.client.countryName) && <span className="text-xs text-slate-500 dark:text-slate-400">{flag(c.client.country)} {c.client.countryName || c.client.country}</span>}
                      {c.waitingOnYou && <span className="px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">waiting on you</span>}
                      {c.unread > 0 && <span className="px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500 text-white">{c.unread} new</span>}
                      <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">{c.lastMessage?.at ? timeAgo(c.lastMessage.at) : ''}</span>
                    </div>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate mt-0.5">{c.projectTitle}</p>
                    <p className={`text-sm truncate mt-0.5 ${c.unread ? 'text-navy-950 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                      {c.lastMessage && !c.lastMessage.fromClient ? <span className="text-slate-400">You: </span> : null}{c.lastMessage?.text || ''}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!loading && rows.length > 0 && (
          <Pagination page={page} pageSize={size} total={rows.length} onPage={setPage} onPageSize={setSize} className="px-4 py-3 border-t border-slate-100 dark:border-white/5" />
        )}
      </section>
    </div>
  )
}
