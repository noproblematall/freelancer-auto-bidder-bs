import { useState, useEffect, useCallback, useMemo } from 'react'
import { getMeetings, createMeeting, updateMeeting, deleteMeeting } from '../services/meetings'
import { useConfirm } from '../components/ConfirmDialog'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const pad = n => String(n).padStart(2, '0')

function toLocalDatetimeValue(date) {
  if (!date) return ''
  const d = new Date(date)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function formatFullDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function buildCalendarGrid(year, month) {
  // month is 0-based
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()

  const cells = []
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i
    cells.push({ day: d, current: false, date: new Date(year, month - 1, d) })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true, date: new Date(year, month, d) })
  }
  // Fill to 42 cells (6 rows × 7 cols)
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, current: false, date: new Date(year, month + 1, d) })
  }
  return cells
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const EMPTY_FORM = { title: '', startTime: '', endTime: '', notes: '' }

export default function CalendarPage() {
  const confirm = useConfirm()
  // "today" per render — the app stays open across midnights, and a frozen
  // module-level date leaves the today-ring on yesterday until relaunch.
  const TODAY = new Date()
  const TODAY_KEY = toDateKey(TODAY)

  const [year, setYear] = useState(TODAY.getFullYear())
  const [month, setMonth] = useState(TODAY.getMonth()) // 0-based
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState(null) // Date object
  const [showForm, setShowForm] = useState(false)
  const [editingMeeting, setEditingMeeting] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async (y, m) => {
    setLoading(true)
    try {
      const data = await getMeetings(y, m + 1) // API is 1-based
      setMeetings(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(year, month)
  }, [year, month, load])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelectedDay(null)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelectedDay(null)
  }

  function goToday() {
    setYear(TODAY.getFullYear())
    setMonth(TODAY.getMonth())
    setSelectedDay(TODAY)
  }

  // O(1) lookup: date key → meetings array, computed once per meetings change
  const meetingsByDay = useMemo(() => {
    const map = {}
    for (const m of meetings) {
      const key = toDateKey(new Date(m.startTime))
      if (!map[key]) map[key] = []
      map[key].push(m)
    }
    return map
  }, [meetings])

  function meetingsForDay(date) {
    return meetingsByDay[toDateKey(date)] || []
  }

  // Memoize the 42-cell grid — only recomputes when month/year change
  const cells = useMemo(() => buildCalendarGrid(year, month), [year, month])

  const selectedMeetings = useMemo(
    () => selectedDay ? meetingsForDay(selectedDay) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedDay, meetingsByDay]
  )

  function openNewForm(date) {
    const defaultStart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T09:00`
    const defaultEnd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T10:00`
    setForm({ title: '', startTime: defaultStart, endTime: defaultEnd, notes: '' })
    setEditingMeeting(null)
    setError(null)
    setShowForm(true)
  }

  function openEditForm(meeting) {
    setForm({
      title: meeting.title,
      startTime: toLocalDatetimeValue(meeting.startTime),
      endTime: toLocalDatetimeValue(meeting.endTime),
      notes: meeting.notes || '',
    })
    setEditingMeeting(meeting)
    setError(null)
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.startTime) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        title: form.title.trim(),
        startTime: new Date(form.startTime).toISOString(),
        endTime: form.endTime ? new Date(form.endTime).toISOString() : null,
        notes: form.notes.trim() || null,
      }
      if (editingMeeting) {
        const updated = await updateMeeting(editingMeeting.id, payload)
        setMeetings(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m))
      } else {
        await createMeeting(payload)
        await load(year, month)
        setSelectedDay(new Date(payload.startTime))
      }
      setShowForm(false)
      setEditingMeeting(null)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(meeting) {
    const ok = await confirm({
      title: 'Delete meeting?',
      message: `"${meeting.title}" will be permanently deleted.`,
      confirmText: 'Delete',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await deleteMeeting(meeting.id)
      setMeetings(prev => prev.filter(m => m.id !== meeting.id))
      if (editingMeeting?.id === meeting.id) setShowForm(false)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="flex h-full gap-6">
      {/* Calendar */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="mb-6 space-y-4">
          <h1 className="text-2xl font-bold text-navy-950 dark:text-white">Calendar</h1>
          {error && !showForm && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-base font-semibold text-slate-700 dark:text-slate-200">
                {MONTHS[month]} {year}
              </span>
              {loading && (
                <div className="w-4 h-4 border-2 border-navy-600 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={goToday}
                className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors"
              >
                Today
              </button>
              <button
                onClick={prevMonth}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </button>
              <button
                onClick={nextMonth}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map(d => (
            <div key={d} className="text-center text-xs font-semibold text-slate-400 dark:text-slate-500 py-2 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 border-l border-t border-slate-200 dark:border-white/8">
          {cells.map(cell => {
            const dayMeetings = meetingsForDay(cell.date)
            const cellKey = toDateKey(cell.date)
            const isToday = cellKey === TODAY_KEY
            const isSelected = selectedDay && toDateKey(cell.date) === toDateKey(selectedDay)

            return (
              <div
                key={cellKey}
                onClick={() => setSelectedDay(cell.date)}
                className={`relative border-r border-b border-slate-200 dark:border-white/8 min-h-[100px] p-1.5 cursor-pointer transition-colors ${
                  cell.current
                    ? 'bg-white dark:bg-navy-900 hover:bg-slate-50 dark:hover:bg-navy-800/50'
                    : 'bg-slate-50/50 dark:bg-navy-950/50 hover:bg-slate-50 dark:hover:bg-navy-800/30'
                } ${isSelected ? 'ring-2 ring-inset ring-emerald-400 dark:ring-emerald-500' : ''}`}
              >
                {/* Day number */}
                <div className={`inline-flex items-center justify-center w-7 h-7 text-sm font-medium rounded-full mb-1 ${
                  isToday
                    ? 'bg-navy-800 dark:bg-emerald-500 text-white dark:text-navy-950'
                    : cell.current
                    ? 'text-slate-700 dark:text-slate-200'
                    : 'text-slate-400 dark:text-slate-600'
                }`}>
                  {cell.day}
                </div>

                {/* Meeting chips */}
                <div className="space-y-0.5">
                  {dayMeetings.slice(0, 3).map(m => (
                    <div
                      key={m.id}
                      className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 truncate leading-tight"
                    >
                      {formatTime(m.startTime)} {m.title}
                    </div>
                  ))}
                  {dayMeetings.length > 3 && (
                    <div className="text-xs text-slate-400 dark:text-slate-500 px-1">
                      +{dayMeetings.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Side panel */}
      <div className="w-80 flex-shrink-0">
        {showForm ? (
          /* Meeting form */
          <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-white/8 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {editingMeeting ? 'Edit Meeting' : 'New Meeting'}
              </h2>
              <button
                onClick={() => { setShowForm(false); setEditingMeeting(null) }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
            )}

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Meeting title"
                  required
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-navy-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Start *</label>
                <input
                  type="datetime-local"
                  value={form.startTime}
                  onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                  required
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-navy-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">End</label>
                <input
                  type="datetime-local"
                  value={form.endTime}
                  onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-navy-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  placeholder="Optional notes..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-navy-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingMeeting ? 'Save Changes' : 'Add Meeting'}
                </button>
                {editingMeeting && (
                  <button
                    type="button"
                    onClick={() => handleDelete(editingMeeting)}
                    className="px-3 py-2 text-sm font-medium rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </form>
          </div>
        ) : selectedDay ? (
          /* Day detail panel */
          <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-white/8 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {selectedMeetings.length === 0 ? 'No meetings' : `${selectedMeetings.length} meeting${selectedMeetings.length > 1 ? 's' : ''}`}
                </p>
              </div>
              <button
                onClick={() => openNewForm(selectedDay)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add
              </button>
            </div>

            {selectedMeetings.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                  </svg>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">No meetings this day</p>
                <button
                  onClick={() => openNewForm(selectedDay)}
                  className="mt-3 text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Schedule one
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedMeetings.map(meeting => (
                  <MeetingCard
                    key={meeting.id}
                    meeting={meeting}
                    onEdit={() => openEditForm(meeting)}
                    onDelete={() => handleDelete(meeting)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Default panel: month overview */
          <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-white/8 rounded-2xl p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">Meetings</h2>
            <p className="text-sm text-slate-400 dark:text-slate-500 mb-6">Select a day to view or add meetings.</p>

            <div>
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                This month
              </h3>
              {meetings.length === 0 && !loading ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">No meetings scheduled.</p>
              ) : (
                <div className="space-y-2">
                  {meetings.slice(0, 8).map(m => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedDay(new Date(m.startTime))}
                      className="w-full text-left px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-navy-800 hover:bg-emerald-50 dark:hover:bg-navy-700 transition-colors group"
                    >
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400">{m.title}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{formatFullDate(m.startTime)}</p>
                    </button>
                  ))}
                  {meetings.length > 8 && (
                    <p className="text-xs text-slate-400 text-center pt-1">+{meetings.length - 8} more</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MeetingCard({ meeting, onEdit, onDelete }) {
  const start = new Date(meeting.startTime)
  const end = meeting.endTime ? new Date(meeting.endTime) : null
  const isPast = start < TODAY

  const fmtGcal = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const gcalEnd = end || new Date(start.getTime() + 3600000)
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(meeting.title)}` +
    `&dates=${fmtGcal(start)}/${fmtGcal(gcalEnd)}` +
    (meeting.notes ? `&details=${encodeURIComponent(meeting.notes)}` : '')

  return (
    <div className={`rounded-xl border p-3 ${isPast ? 'border-slate-200 dark:border-white/8 opacity-60' : 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/10'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{meeting.title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            {end && ` – ${end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}
          </p>
          {meeting.projectTitle && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
              {meeting.projectUrl
                ? <a href={meeting.projectUrl} target="_blank" rel="noreferrer" className="hover:text-emerald-600 dark:hover:text-emerald-400">{meeting.projectTitle}</a>
                : meeting.projectTitle
              }
            </p>
          )}
          {meeting.notes && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{meeting.notes}</p>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <a
            href={gcalUrl}
            target="_blank"
            rel="noreferrer"
            title="Add to Google Calendar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
          </a>
          <button
            onClick={onEdit}
            title="Edit"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
