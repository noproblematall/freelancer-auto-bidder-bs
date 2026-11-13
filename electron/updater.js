'use strict'

// Automatic updates from GitHub Releases.
//
// `npm run release:win` builds the installer and uploads it, with latest.yml,
// to a GitHub Release of the repository named under `publish` in
// electron-builder.yml. Every installed copy checks that release shortly
// after start-up and then every few hours; a newer version is downloaded in
// the background, the user is offered a restart, and whatever they choose the
// update is installed the next time the app quits. The database, settings and
// licence live in userData and are untouched by an update.
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
  ipcMain.handle('update:install', () => { install(); return true })

  if (!autoUpdater || !app.isPackaged) {
    status = { state: 'unavailable', version: app.getVersion() }
    return
  }

  autoUpdater.autoDownload = true
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
  autoUpdater.on('update-available', (info) => send({ state: 'downloading', latest: info.version, percent: 0 }))
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

module.exports = { setup, check, install, getStatus: () => status }
