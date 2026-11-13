'use strict'

// Automatic updates from GitHub Releases.
//
// `npm run release:win` builds the installer and uploads it, with latest.yml,
// to a GitHub Release of the repository named under `publish` in
// electron-builder.yml. Every installed copy checks that release shortly
// after start-up and then every few hours. A newer version is only announced
// in the sidebar ("v1.2.3 available — Upgrade / Cancel"); nothing is
// downloaded until the user clicks Upgrade. Once downloaded the user is
// offered a restart, and whatever they choose the update is installed the
// next time the app quits. The database, settings and licence live in
// userData and are untouched by an update.
const { app, dialog, ipcMain } = require('electron')

let autoUpdater = null
try {
  ({ autoUpdater } = require('electron-updater'))
} catch (err) {
  console.warn('[BidPilot] electron-updater unavailable:', err.message)
}

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000 // 4 hours
const FIRST_CHECK_DELAY_MS = 15 * 1000     // let the backend and window settle first

let getWindow = () => null
let status = { state: 'idle', version: app.getVersion() }
let timer = null
let promptShown = false

function send(next) {
  status = { ...status, ...next }
  const win = getWindow()
  if (win && !win.isDestroyed()) win.webContents.send('update:status', status)
}

// GitHub answers 404 (or has no latest.yml) while no release has been
// published yet — that is "nothing to update to", not a failure.
function isNoRelease(err) {
  const m = String(err?.message || err || '')
  return /404|not found|latest\.yml|no published versions|cannot find latest/i.test(m)
}

function describe(err) {
  const m = String(err?.message || err || '')
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|net::ERR|getaddrinfo/i.test(m)) return 'Could not reach GitHub — check the internet connection.'
  return m.split('\n')[0].slice(0, 200)
}

function check(manual = false) {
  if (!autoUpdater || !app.isPackaged) {
    if (manual) send({ state: 'unavailable', manual })
    return Promise.resolve(null)
  }
  send({ state: 'checking', manual })
  return autoUpdater.checkForUpdates().catch((err) => {
    if (isNoRelease(err)) send({ state: 'no-release', manual, checkedAt: Date.now() })
    else send({ state: 'error', message: describe(err), manual })
    return null
  })
}

// The user chose "Upgrade": fetch the version found by the last check.
function download() {
  if (!autoUpdater || !app.isPackaged) return Promise.resolve(false)
  if (status.state !== 'available') return Promise.resolve(false)
  send({ state: 'downloading', percent: 0 })
  return autoUpdater.downloadUpdate().then(() => true).catch((err) => {
    send({ state: 'error', message: describe(err) })
    return false
  })
}

// The user chose "Cancel": stay on this version and stop mentioning the new
// one until a later version appears (or they check again by hand).
function dismiss() {
  if (status.state !== 'available') return
  send({ state: 'dismissed', dismissed: status.latest })
}

function install() {
  if (!autoUpdater) return
  // Stop the engine cleanly before the installer takes over.
  try { require('../backend/src/services/bidding/scheduler').stop() } catch (_) {}
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
}

function offerRestart(info) {
  if (promptShown) return
  promptShown = true
  const win = getWindow()
  const opts = {
    type: 'info',
    title: 'Update ready',
    message: `BidPilot ${info.version} has been downloaded.`,
    detail: 'Restart now to install it, or keep working and it will be installed the next time BidPilot closes.',
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  }
  const shown = win && !win.isDestroyed() ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)
  shown.then(({ response }) => { if (response === 0) install() }).catch(() => {})
}

function setup(windowGetter) {
  getWindow = windowGetter

  ipcMain.handle('update:status', () => status)
  ipcMain.handle('update:check', () => check(true).then(() => status))
  ipcMain.handle('update:download', () => download().then(() => status))
  ipcMain.handle('update:dismiss', () => { dismiss(); return status })
  ipcMain.handle('update:install', () => { install(); return true })

  if (!autoUpdater || !app.isPackaged) {
    status = { state: 'unavailable', version: app.getVersion() }
    return
  }

  // Nothing is downloaded until the user clicks "Upgrade" in the sidebar.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = {
    info: (m) => console.log('[BidPilot update]', m),
    warn: (m) => console.warn('[BidPilot update]', m),
    error: (m) => console.error('[BidPilot update]', m),
    debug: () => {},
  }

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }))
  autoUpdater.on('update-not-available', (info) => send({ state: 'up-to-date', latest: info?.version, checkedAt: Date.now() }))
  autoUpdater.on('update-available', (info) => {
    // A version the user already declined is not offered again by the
    // background check; a manual check always shows it.
    if (!status.manual && status.dismissed === info.version) { send({ state: 'dismissed', latest: info.version }); return }
    send({ state: 'available', latest: info.version, dismissed: null, releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes.slice(0, 2000) : null })
  })
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent), bytesPerSecond: p.bytesPerSecond }))
  autoUpdater.on('update-downloaded', (info) => {
    send({ state: 'ready', latest: info.version, percent: 100 })
    offerRestart(info)
  })
  autoUpdater.on('error', (err) => {
    if (isNoRelease(err)) send({ state: 'no-release', checkedAt: Date.now() })
    else send({ state: 'error', message: describe(err) })
  })

  setTimeout(() => check(false), FIRST_CHECK_DELAY_MS)
  timer = setInterval(() => check(false), CHECK_EVERY_MS)
  app.on('before-quit', () => { if (timer) clearInterval(timer) })
}

module.exports = { setup, check, download, dismiss, install, getStatus: () => status }
