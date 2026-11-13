import { useEffect, useState } from 'react'

// Sidebar footer line: the app version, and the state of automatic updates
// (electron/updater.js). Outside Electron it is just the version.
export default function UpdateStatus() {
  const bridge = typeof window !== 'undefined' ? window.electron?.update : null
  const [status, setStatus] = useState(null)

  useEffect(() => {
    if (!bridge) return
    bridge.status().then(setStatus).catch(() => {})
    return bridge.onStatus(setStatus)
  }, [])

  const version = __APP_VERSION__
  const base = 'px-3 py-1.5 text-xs'

  if (!bridge || !status || status.state === 'unavailable' || status.state === 'idle') {
    return (
      <p className={`${base} text-slate-400 dark:text-slate-500 flex items-center justify-between`}>
        <span>BidPilot v{version}</span>
        {bridge && status?.state === 'idle' && (
          <button type="button" onClick={() => bridge.check()} className="underline hover:text-slate-600 dark:hover:text-slate-300" title="Check GitHub for a newer version">Check for updates</button>
        )}
      </p>
    )
  }

  if (status.state === 'ready') {
    return (
      <button
        type="button"
        onClick={() => bridge.install()}
        className={`w-full mb-1 ${base} rounded-lg text-left font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors`}
        title="The new version is downloaded. Click to restart BidPilot and install it."
      >
        v{status.latest} ready · <span className="underline">Restart to update</span>
      </button>
    )
  }

  if (status.state === 'downloading') {
    const pct = Math.max(0, Math.min(100, status.percent || 0))
    return (
      <div className={`${base} text-slate-500 dark:text-slate-400`} title="A newer version is being downloaded in the background">
        <div className="flex items-center justify-between">
          <span>Downloading v{status.latest}</span>
          <span>{pct}%</span>
        </div>
        <div className="mt-1 h-1 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  const text = status.state === 'checking'
    ? 'Checking for updates…'
    : status.state === 'error'
      ? (status.manual ? `Update check failed` : `BidPilot v${version}`)
      : `BidPilot v${version} · up to date`
  const title = status.state === 'error' ? status.message : status.state === 'up-to-date' ? 'This is the newest version on GitHub' : ''

  return (
    <p className={`${base} text-slate-400 dark:text-slate-500 flex items-center justify-between`} title={title}>
      <span>{text}</span>
      {status.state !== 'checking' && (
        <button type="button" onClick={() => bridge.check()} className="underline hover:text-slate-600 dark:hover:text-slate-300" title="Check GitHub for a newer version">Check</button>
      )}
    </p>
  )
}
