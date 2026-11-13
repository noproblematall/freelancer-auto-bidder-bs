import { useEffect, useState } from 'react'

// Sidebar footer: the installed version, and the state of updates from GitHub
// (electron/updater.js). A newer version is only announced — "Upgrade"
// downloads it, "Cancel" keeps the current version. Outside Electron it is
// just the version.
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
  const muted = `${base} text-slate-400 dark:text-slate-500`
  const link = 'underline hover:text-slate-600 dark:hover:text-slate-300'

  const VersionRow = ({ text = `BidPilot v${version}`, action = 'Check for updates', title = '' }) => (
    <p className={`${muted} flex items-center justify-between gap-2`} title={title}>
      <span className="truncate">{text}</span>
      {bridge && action && (
        <button type="button" onClick={() => bridge.check()} className={`${link} shrink-0`} title="Check GitHub for a newer version">{action}</button>
      )}
    </p>
  )

  if (!bridge || !status || status.state === 'unavailable' || status.state === 'idle') {
    return <VersionRow action={bridge && status?.state === 'idle' ? 'Check for updates' : ''} />
  }

  switch (status.state) {
    case 'available':
      return (
        <div className={`${base} mb-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200`} title={status.releaseNotes || `Version ${status.latest} is on GitHub; you have ${version}.`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">v{status.latest} available</span>
            <span className="text-emerald-600/70 dark:text-emerald-300/60">you have v{version}</span>
          </div>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={() => bridge.download()}
              className="flex-1 px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors"
              title="Download the new version now"
            >
              Upgrade
            </button>
            <button
              type="button"
              onClick={() => bridge.dismiss()}
              className="flex-1 px-2 py-1 rounded-md bg-white/70 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 text-emerald-800 dark:text-emerald-100 transition-colors"
              title="Keep the current version"
            >
              Cancel
            </button>
          </div>
        </div>
      )

    case 'downloading': {
      const pct = Math.max(0, Math.min(100, status.percent || 0))
      return (
        <div className={`${base} text-slate-500 dark:text-slate-400`} title="The new version is being downloaded">
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

    case 'ready':
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

    case 'checking':
      return <VersionRow text="Checking for updates…" action="" />

    case 'error':
      return <VersionRow text={status.manual ? 'Update check failed' : `BidPilot v${version}`} action="Check" title={status.message} />

    case 'no-release':
      return <VersionRow text={`BidPilot v${version} · no update published yet`} action="Check" title="No release has been published on GitHub yet" />

    case 'dismissed':
      return <VersionRow text={`BidPilot v${version}`} action="Check" title={`Version ${status.latest || status.dismissed} is available on GitHub; you chose to stay on ${version}.`} />

    default: // up-to-date
      return <VersionRow text={`BidPilot v${version} · up to date`} action="Check" title="This is the newest version on GitHub" />
  }
}
