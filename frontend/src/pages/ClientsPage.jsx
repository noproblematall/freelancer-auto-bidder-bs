import { useState, useEffect, useRef } from 'react'
import { useClients } from '../hooks/useClients'
import { timeAgo, formatAmount } from '../utils/formatters'
import { backfillClients } from '../services/clients'

const _regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

function getCountryInfo(code) {
  if (!code || code.length !== 2) return null
  const upper = code.toUpperCase()
  if (upper === 'EU') return null
  const flag = String.fromCodePoint(
    0x1F1E6 - 65 + upper.charCodeAt(0),
    0x1F1E6 - 65 + upper.charCodeAt(1)
  )
  let name = upper
  try { name = _regionNames.of(upper) || upper } catch {}
  return { flag, name }
}

function ClientCard({ client, onNotesChange }) {
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState(client.notes || '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const savedNotes = useRef(client.notes || '')

  const ci = getCountryInfo(client.country)

  const clientName = client.displayName || client.username || `Client #${client.freelancerUserId}`

  const handleNotesBlur = async () => {
    if (notes === savedNotes.current || saving) return
    setSaving(true)
    try {
      await onNotesChange(client.id, notes)
      savedNotes.current = notes
      setSaveError(null)
    } catch {
      // Keep the typed text so nothing is lost; surface the failure inline
      setSaveError('Save failed — click away to retry.')
    } finally {
      setSaving(false)
    }
  }

  const handleNotesChange = (e) => {
    setNotes(e.target.value)
  }

  return (
    <div className="bg-white dark:bg-navy-800/90 border border-gray-200 dark:border-white/8 rounded-lg overflow-hidden">
      <button
        className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-navy-700/50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400 font-semibold text-sm flex-shrink-0">
              {(client.displayName || client.username || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-gray-900 dark:text-white truncate" title={clientName}>
                  {clientName}
                </span>
                {client.username && client.displayName && (
                  <span className="text-xs text-gray-400 dark:text-slate-500">@{client.username}</span>
                )}
                {ci && (
                  <span title={ci.name} className="text-base leading-none">{ci.flag}</span>
                )}
              </div>
              <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                {client.projectCount} project{client.projectCount !== 1 ? 's' : ''}
                {client.totalValue > 0 && (
                  <> · {formatAmount(client.totalValue)} total</>
                )}
                {client.lastProjectAt && (
                  <> · Last {timeAgo(client.lastProjectAt)}</>
                )}
              </div>
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 dark:text-slate-500 flex-shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-white/8 p-4 space-y-4">
          {/* Project history */}
          {client.projects && client.projects.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-2">Project History</h4>
              <div className="space-y-1.5">
                {client.projects.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 dark:text-slate-200 truncate mr-2" title={p.title}>{p.title}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {p.amount > 0 && (
                        <span className="text-gray-500 dark:text-slate-400">{formatAmount(p.amount)}</span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        p.status === 'converted'
                          ? 'bg-green-100 dark:bg-emerald-900/30 text-green-700 dark:text-emerald-400'
                          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      }`}>
                        {p.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CRM notes */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Notes</h4>
            <textarea
              className="w-full text-sm bg-white dark:bg-navy-900 border border-gray-200 dark:border-white/10 rounded-md p-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 disabled:opacity-50"
              rows={3}
              placeholder="Add notes about this client..."
              value={notes}
              onChange={handleNotesChange}
              onBlur={handleNotesBlur}
              disabled={saving}
            />
            {saveError ? (
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{saveError}</p>
            ) : (
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{saving ? 'Saving...' : 'Auto-saves on blur'}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FollowUpItem({ thread, section }) {
  const timestamp = section === 'waitingOnMe'
    ? thread.lastMessageFromClientAt
    : thread.lastMessageFromMeAt

  const threadUrl = `https://www.freelancer.com/messages/thread/${thread.freelancerThreadId}`

  return (
    <div className="flex items-start justify-between gap-3 p-3 bg-white dark:bg-navy-800/90 border border-gray-200 dark:border-white/8 rounded-lg">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            Thread #{thread.freelancerThreadId}
          </span>
          {timestamp && (
            <span className="text-xs text-gray-400 dark:text-slate-500">{timeAgo(timestamp)}</span>
          )}
        </div>
        {thread.lastMessageText && (
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 truncate" title={thread.lastMessageText}>{thread.lastMessageText}</p>
        )}
      </div>
      <a
        href={threadUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 whitespace-nowrap"
      >
        Open ↗
      </a>
    </div>
  )
}

const TABS = [
  { key: 'clients', label: 'Clients' },
  { key: 'follow-ups', label: 'Follow-ups' },
]

export default function ClientsPage() {
  const [activeTab, setActiveTab] = useState('clients')
  const [backfilling, setBackfilling] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState(null)
  const { clients, followUps, loading, error, fetchClients, fetchFollowUps, saveNotes } = useClients()

  useEffect(() => {
    fetchClients()
    fetchFollowUps()
  }, [fetchClients, fetchFollowUps])

  const handleBackfill = async () => {
    setBackfilling(true)
    setBackfillMsg(null)
    try {
      const result = await backfillClients()
      setBackfillMsg(result.message)
      await fetchClients()
    } catch (err) {
      setBackfillMsg(err.response?.data?.error || 'Backfill failed')
    } finally {
      setBackfilling(false)
    }
  }

  const totalFollowUps = followUps.waitingOnMe.length + followUps.noResponse.length

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Clients</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Converted clients and message follow-ups</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleBackfill}
            disabled={backfilling}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {backfilling ? 'Syncing...' : 'Sync from history'}
          </button>
          {backfillMsg && (
            <p className="text-xs text-gray-500 dark:text-slate-400">{backfillMsg}</p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-white/8">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
            {tab.key === 'follow-ups' && totalFollowUps > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 font-semibold">
                {totalFollowUps}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Clients tab */}
      {activeTab === 'clients' && (
        <div>
          {loading && (
            <div className="text-center text-gray-400 dark:text-slate-500 py-12 text-sm">Loading clients...</div>
          )}
          {error && (
            <div className="text-center text-red-500 dark:text-red-400 py-12 text-sm">{error}</div>
          )}
          {!loading && !error && clients.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400 dark:text-slate-500 text-sm">No converted clients yet.</p>
              <p className="text-gray-300 dark:text-slate-600 text-xs mt-1">
                Clients appear here when a bid is converted after the client messages you.
              </p>
            </div>
          )}
          {!loading && clients.length > 0 && (
            <div className="space-y-2">
              {clients.map(client => (
                <ClientCard
                  key={client.id}
                  client={client}
                  onNotesChange={saveNotes}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Follow-ups tab */}
      {activeTab === 'follow-ups' && (
        <div className="space-y-6">
          {/* Waiting on me */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-2 flex items-center gap-2">
              <span>⏳ Waiting on me</span>
              <span className="text-xs text-gray-400 dark:text-slate-500 font-normal">— client messaged, no reply from me for &gt;12h</span>
            </h3>
            {followUps.waitingOnMe.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-slate-500 pl-1">All caught up</p>
            ) : (
              <div className="space-y-2">
                {followUps.waitingOnMe.map(t => (
                  <FollowUpItem key={t.id} thread={t} section="waitingOnMe" />
                ))}
              </div>
            )}
          </div>

          {/* No response */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-2 flex items-center gap-2">
              <span>📭 No response</span>
              <span className="text-xs text-gray-400 dark:text-slate-500 font-normal">— I messaged, client hasn't replied for &gt;48h</span>
            </h3>
            {followUps.noResponse.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-slate-500 pl-1">Nothing here</p>
            ) : (
              <div className="space-y-2">
                {followUps.noResponse.map(t => (
                  <FollowUpItem key={t.id} thread={t} section="noResponse" />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
