import { useState, useEffect, useCallback } from 'react'

const TOKEN_KEY = 'gl_admin_token'
const getToken = () => sessionStorage.getItem(TOKEN_KEY) || ''

async function callApi(action, params) {
  const res = await fetch('/api/admin/license', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': getToken() },
    body: JSON.stringify({ action, ...(params || {}) }),
  })
  let j = {}
  try {
    j = await res.json()
  } catch {}
  return { ok: res.ok && j.ok, status: res.status, j }
}

const input =
  'rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 text-white outline-none focus-visible:ring-2 focus-visible:ring-accent-400'
const primary = 'rounded-lg bg-accent-500 px-4 py-2 font-semibold text-navy-950 transition hover:bg-accent-400'
const ghost =
  'rounded-lg border border-navy-700 bg-navy-800/60 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-navy-700'
const danger =
  'rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-1.5 text-sm font-medium text-rose-300 transition hover:bg-rose-950/70'
const card = 'rounded-2xl border border-navy-800 bg-navy-900/50 p-5'

function CopyButton({ text, className = ghost, compact = false }) {
  const [copied, setCopied] = useState(false)
  const cls = compact
    ? 'rounded-md border border-navy-700 bg-navy-800/60 px-1.5 py-0.5 text-[11px] font-medium text-slate-400 transition hover:bg-navy-700 hover:text-white'
    : className
  return (
    <button
      className={cls}
      title="Copy key"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }}
    >
      {copied ? '✓' : 'Copy'}
    </button>
  )
}

function Login({ onAuthed }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const signIn = async () => {
    setErr('')
    setBusy(true)
    sessionStorage.setItem(TOKEN_KEY, pw)
    const r = await callApi('ping')
    setBusy(false)
    if (r.ok) onAuthed()
    else {
      sessionStorage.removeItem(TOKEN_KEY)
      if (r.status === 401) setErr('Wrong password.')
      else if (r.j.error === 'admin_not_configured') setErr('Server is missing ADMIN_TOKEN — set it in the Vercel dashboard (not .env.local).')
      else setErr(r.j.error || 'Sign-in failed.')
    }
  }

  return (
    <div className="mx-auto mt-[14vh] w-full max-w-sm px-5">
      <div className={card}>
        <h1 className="text-xl font-bold text-white">License Admin</h1>
        <p className="mt-1 text-sm text-slate-400">Enter the admin password to continue.</p>
        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-400">Admin password</label>
        <input
          type="password"
          autoComplete="off"
          className={`${input} mt-1.5 w-full`}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && signIn()}
        />
        <button className={`${primary} mt-3 w-full`} onClick={signIn} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {err && <p className="mt-3 text-sm text-rose-300">{err}</p>}
      </div>
    </div>
  )
}

function CreateCard({ onCreated }) {
  const [label, setLabel] = useState('')
  const [devices, setDevices] = useState('1')
  const [newKey, setNewKey] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setErr('')
    setNewKey('')
    setBusy(true)
    const r = await callApi('create', { label: label.trim(), devices })
    setBusy(false)
    if (!r.ok)
      return setErr(
        r.j.error === 'db_unconfigured'
          ? 'Database not configured yet — set DATABASE_URL in Vercel and run the schema first.'
          : r.j.error || 'Create failed.'
      )
    setNewKey(r.j.key)
    setLabel('')
    onCreated()
  }

  return (
    <div className={card}>
      <strong className="text-white">Create license</strong>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
            Label (who it's for — optional)
          </label>
          <input className={`${input} mt-1.5 w-full`} placeholder="Sam (friend)" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">Devices</label>
          <input type="number" min="1" className={`${input} mt-1.5 w-24`} value={devices} onChange={(e) => setDevices(e.target.value)} />
        </div>
        <button className={primary} onClick={create} disabled={busy}>
          {busy ? 'Creating…' : 'Create'}
        </button>
      </div>
      {newKey && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-accent-500/40 bg-navy-950 px-3 py-2.5">
          <span className="text-sm text-slate-400">New key:</span>
          <code className="font-mono text-white">{newKey}</code>
          <CopyButton text={newKey} />
        </div>
      )}
      {err && <p className="mt-2 text-sm text-rose-300">{err}</p>}
    </div>
  )
}

function StatusPill({ status }) {
  const cls =
    status === 'active'
      ? 'bg-accent-500/15 text-accent-400'
      : status === 'expired'
        ? 'bg-amber-500/15 text-amber-300'
        : 'bg-rose-500/15 text-rose-300'
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{status}</span>
}

function TypePill({ type }) {
  const cls =
    type === 'trial'
      ? 'bg-violet-500/15 text-violet-300'
      : type === 'manual'
        ? 'bg-sky-500/15 text-sky-300'
        : 'bg-navy-700/60 text-slate-300'
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{type}</span>
}

const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

// For time-limited licenses (trials): remaining days or when it ended.
function expiry(it) {
  if (!it.expiresAt) return null
  const ms = new Date(it.expiresAt).getTime() - Date.now()
  const days = Math.ceil(ms / 86400000)
  return { expired: ms <= 0, days }
}

// Compact per-row action buttons (single line, small).
const rowBtn =
  'rounded-md border border-navy-700 bg-navy-800/60 px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-navy-700 hover:text-white'
const rowBtnDanger =
  'rounded-md border border-rose-900/60 bg-rose-950/40 px-2 py-1 text-[11px] font-medium text-rose-300 transition hover:bg-rose-950/70'

function LicenseTable({ items, onReload }) {
  const act = async (action, it, params) => {
    await callApi(action, { id: it.id, ...params })
    onReload()
  }

  if (!items.length) return <p className="mt-2 text-sm text-slate-400">No licenses yet.</p>

  const th = 'border-b border-navy-800 py-2.5 pr-4 whitespace-nowrap'
  const td = 'border-b border-navy-800/60 py-2.5 pr-4 whitespace-nowrap'

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className={th}>Label</th>
            <th className={th}>Key</th>
            <th className={th}>Status</th>
            <th className={th}>Type</th>
            <th className={th}>Devices</th>
            <th className={th}>Issued</th>
            <th className={th}>Expires</th>
            <th className={th}>Last seen</th>
            <th className="border-b border-navy-800 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const exp = expiry(it)
            const shownStatus = it.status === 'active' && exp?.expired ? 'expired' : it.status
            return (
            <tr key={it.id} className="align-middle transition-colors hover:bg-navy-800/30">
              <td className={`${td} max-w-[140px] truncate text-slate-200`} title={it.label || ''}>
                {it.label || <span className="text-slate-600">—</span>}
              </td>
              <td className={td}>
                <div className="flex items-center gap-1.5">
                  <code className="font-mono text-[12px] tracking-tight text-white">{it.key || '—'}</code>
                  {it.key && <CopyButton text={it.key} compact />}
                </div>
              </td>
              <td className={td}><StatusPill status={shownStatus} /></td>
              <td className={td}><TypePill type={it.type} /></td>
              <td className={`${td} text-slate-300`}>
                <span>{it.devicesUsed}/{it.machineLimit}</span>
                {it.deviceNames && (
                  <span className="ml-1.5 inline-block max-w-[130px] truncate align-bottom text-[11px] text-slate-500" title={it.deviceNames}>
                    · {it.deviceNames}
                  </span>
                )}
              </td>
              <td className={`${td} text-slate-400`} title={it.createdAt || ''}>{fmtDate(it.createdAt)}</td>
              <td className={td} title={it.expiresAt || ''}>
                {!exp ? (
                  <span className="text-slate-600">—</span>
                ) : exp.expired ? (
                  <span className="text-amber-300">{fmtDate(it.expiresAt)}</span>
                ) : (
                  <span className="text-slate-300">
                    {fmtDate(it.expiresAt)} <span className="text-slate-500">· {exp.days}d left</span>
                  </span>
                )}
              </td>
              <td className={`${td} text-slate-400`} title={it.lastSeenAt || ''}>{fmtDate(it.lastSeenAt)}</td>
              <td className="border-b border-navy-800/60 py-2.5">
                <div className="flex flex-nowrap justify-end gap-1">
                  {it.status === 'active' ? (
                    <button className={rowBtnDanger} onClick={() => act('setStatus', it, { status: 'revoked' })}>Revoke</button>
                  ) : (
                    <button className={rowBtn} onClick={() => act('setStatus', it, { status: 'active' })}>Reactivate</button>
                  )}
                  <button
                    className={rowBtn}
                    title="Free all device slots"
                    onClick={() => window.confirm(`Free all device slots for ${it.label || 'this license'}?`) && act('resetDevices', it)}
                  >
                    Reset
                  </button>
                  <button
                    className={rowBtn}
                    title="Change device limit"
                    onClick={() => {
                      const n = window.prompt('Device limit:', it.machineLimit)
                      if (n != null) act('setLimit', it, { machineLimit: n })
                    }}
                  >
                    Limit
                  </button>
                  <button
                    className={rowBtnDanger}
                    title="Permanently delete"
                    onClick={() => window.confirm('Permanently delete this license? This cannot be undone.') && act('delete', it)}
                  >
                    ✕
                  </button>
                </div>
              </td>
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Quick launch-day stats strip: totals by type + trial health.
function Stats({ items }) {
  const paid = items.filter((i) => i.type === 'paid').length
  const manual = items.filter((i) => i.type === 'manual').length
  const trials = items.filter((i) => i.type === 'trial')
  const running = trials.filter((i) => i.status === 'active' && !expiry(i)?.expired).length
  const chips = [
    { label: 'Total', value: items.length },
    { label: 'Paid', value: paid },
    { label: 'Manual', value: manual },
    { label: 'Trials', value: trials.length },
    { label: 'Trials running', value: running, accent: true },
  ]
  return (
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
      {chips.map((c) => (
        <div key={c.label} className="rounded-xl border border-navy-800 bg-navy-900/50 px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">{c.label}</div>
          <div className={`mt-0.5 text-xl font-bold ${c.accent ? 'text-accent-400' : 'text-white'}`}>{c.value}</div>
        </div>
      ))}
    </div>
  )
}

function Dashboard({ onSignOut }) {
  const [items, setItems] = useState([])
  const [msg, setMsg] = useState('Loading…')

  const load = useCallback(async () => {
    setMsg('Loading…')
    const r = await callApi('list')
    if (!r.ok) {
      if (r.status === 401) return onSignOut()
      if (r.j.error === 'db_unconfigured')
        setMsg('License database not configured yet. Set DATABASE_URL in the Vercel dashboard and run api/license/schema.sql, then Refresh.')
      else setMsg(r.j.error || 'Failed to load.')
      return
    }
    setItems(r.j.items || [])
    setMsg('')
  }, [onSignOut])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Growlance Licenses</h1>
        <button className={ghost} onClick={onSignOut}>Sign out</button>
      </div>

      {!msg && items.length > 0 && <Stats items={items} />}

      <div className="mt-5">
        <CreateCard onCreated={load} />
      </div>

      <div className={`${card} mt-5`}>
        <div className="flex items-center justify-between">
          <strong className="text-white">Licenses</strong>
          <button className={ghost} onClick={load}>Refresh</button>
        </div>
        {msg ? <p className="mt-2 text-sm text-slate-400">{msg}</p> : <LicenseTable items={items} onReload={load} />}
      </div>
    </div>
  )
}

export function AdminApp() {
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!getToken()) {
      setChecking(false)
      return
    }
    callApi('ping').then((r) => {
      setAuthed(r.ok)
      setChecking(false)
    })
  }, [])

  const signOut = () => {
    sessionStorage.removeItem(TOKEN_KEY)
    setAuthed(false)
  }

  if (checking) return <div className="mt-[20vh] text-center text-slate-400">Loading…</div>
  return authed ? <Dashboard onSignOut={signOut} /> : <Login onAuthed={() => setAuthed(true)} />
}
