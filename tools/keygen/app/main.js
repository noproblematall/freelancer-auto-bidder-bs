'use strict'

// BidPilot Keygen — a small desktop app that issues device-locked license
// keys. Keeps a list of every device it has issued a key for (devices.json in
// its own userData folder) and signs new keys with the private key baked in at
// build time (private-key.generated.js, written by ../build.js).

const { app, BrowserWindow, ipcMain, dialog, clipboard, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

app.setName('BidPilot Keygen')

const OFFLINE_PREFIX = 'GROWL1.'

let PRIVATE_KEY_PEM = null
try {
  PRIVATE_KEY_PEM = require('./private-key.generated.js')
} catch {}

// ── Device registry ──────────────────────────────────────────────────────────
function storePath() {
  return path.join(app.getPath('userData'), 'devices.json')
}

// One-time: the first builds ran as "Growlance Keygen"; carry its device list over.
function migrateOldStore() {
  try {
    if (fs.existsSync(storePath())) return
    const old = path.join(path.dirname(app.getPath('userData')), 'Growlance Keygen', 'devices.json')
    if (fs.existsSync(old)) { fs.mkdirSync(path.dirname(storePath()), { recursive: true }); fs.copyFileSync(old, storePath()) }
  } catch {}
}
function loadDevices() {
  try {
    const list = JSON.parse(fs.readFileSync(storePath(), 'utf8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
function saveDevices(list) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true })
  fs.writeFileSync(storePath(), JSON.stringify(list, null, 2), { mode: 0o600 })
}

// ── Key signing ──────────────────────────────────────────────────────────────
function normalizeDeviceNumber(input) {
  const hex = String(input || '').toUpperCase().replace(/[^0-9A-F]/g, '')
  return hex.length === 16 ? hex.match(/.{1,4}/g).join('-') : null
}

function makeKey(deviceNumber, { days = null, label = null } = {}) {
  const payload = { v: 1, d: deviceNumber, iat: Date.now(), exp: days ? Date.now() + days * 86400000 : null }
  if (label) payload.label = String(label).slice(0, 80)
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const priv = crypto.createPrivateKey(PRIVATE_KEY_PEM)
  const sig = crypto.sign(null, Buffer.from(body), priv).toString('base64url')
  return { key: OFFLINE_PREFIX + body + '.' + sig, payload }
}

// ── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.handle('devices:list', () => loadDevices())

ipcMain.handle('devices:add', (_e, { device, label, days }) => {
  const number = normalizeDeviceNumber(device)
  if (!number) return { error: 'The device number has 16 letters and digits, like 3F9A-1C2B-77D0-E4A5.' }
  let d = null
  if (days !== null && days !== undefined && days !== '') {
    d = Number(days)
    if (!Number.isInteger(d) || d < 1 || d > 3650) return { error: 'Days must be a whole number between 1 and 3650.' }
  }
  const list = loadDevices()
  if (list.some((x) => x.device === number)) return { error: `Device ${number} already has a key. Remove it first to issue a new one.` }
  const { key, payload } = makeKey(number, { days: d, label: String(label || '').trim() || null })
  const entry = { device: number, label: payload.label || null, key, createdAt: payload.iat, expiresAt: payload.exp }
  list.unshift(entry)
  saveDevices(list)
  return { ok: true, entry }
})

ipcMain.handle('devices:remove', (_e, device) => {
  const list = loadDevices().filter((x) => x.device !== device)
  saveDevices(list)
  return { ok: true }
})

ipcMain.handle('key:copy', (_e, device) => {
  const entry = loadDevices().find((x) => x.device === device)
  if (!entry) return { error: 'Device not found.' }
  clipboard.writeText(entry.key)
  return { ok: true }
})

ipcMain.handle('key:save', async (e, device) => {
  const entry = loadDevices().find((x) => x.device === device)
  if (!entry) return { error: 'Device not found.' }
  const win = BrowserWindow.fromWebContents(e.sender)
  const r = await dialog.showSaveDialog(win, {
    title: 'Save key file',
    defaultPath: path.join(app.getPath('documents'), `BidPilot-${device}.key`),
    filters: [{ name: 'BidPilot key', extensions: ['key'] }],
  })
  if (r.canceled || !r.filePath) return { canceled: true }
  fs.writeFileSync(r.filePath, entry.key + '\n')
  return { ok: true, path: r.filePath }
})

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 820,
    height: 600,
    minWidth: 640,
    minHeight: 420,
    backgroundColor: '#12151b',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.loadFile(path.join(__dirname, 'index.html'))
  win.once('ready-to-show', () => win.show())
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  migrateOldStore()
  if (!PRIVATE_KEY_PEM) {
    dialog.showErrorBox(
      'BidPilot Keygen is not set up',
      'This build has no signing key. Build it with tools/keygen/build.js after running init-keypair.js.'
    )
    app.quit()
    return
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => app.quit())
