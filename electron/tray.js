'use strict'

// Notification-area icon (Windows system tray, Linux tray). While the app is
// running the icon is always there:
//   • click the icon            → open the window
//   • minimize the window       → the window hides; only the tray icon remains
//   • close the window          → the app quits (handled in main.js)
// macOS keeps its normal Dock behaviour and gets no tray icon.

const { app, Tray, Menu, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')

let tray = null

// Packaged: shipped next to app.asar as an extraResource (a real file, which
// Windows needs to load an .ico). Dev: straight from the build folder.
function iconPath() {
  const dir = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'build')
  return path.join(dir, process.platform === 'win32' ? 'icon.ico' : 'icon.png')
}

// Brings the window back from the tray (or from a normal minimize) and focuses it.
function showWindow(win) {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

// `getWindow` returns the current main window (or null).
function createTray(getWindow) {
  if (tray || process.platform === 'darwin') return tray
  const file = iconPath()
  if (!fs.existsSync(file)) {
    console.warn('[BidPilot] Tray icon not found:', file)
    return null
  }
  try {
    // Windows picks the right size out of the .ico for the screen's scaling.
    tray = new Tray(process.platform === 'win32' ? file : nativeImage.createFromPath(file).resize({ width: 24, height: 24 }))
  } catch (err) {
    console.warn('[BidPilot] Could not create the tray icon:', err.message)
    tray = null
    return null
  }
  const open = () => showWindow(getWindow())
  tray.setToolTip('BidPilot')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open BidPilot', click: open },
    { type: 'separator' },
    { label: 'Quit BidPilot', click: () => app.quit() },
  ]))
  tray.on('click', open)
  tray.on('double-click', open)
  return tray
}

// Minimizing hides the window so it leaves the taskbar. Only when the tray
// icon exists: without it there would be no way to bring the window back.
function hideToTrayOnMinimize(win) {
  if (process.platform === 'darwin') return
  win.on('minimize', () => {
    if (tray && !tray.isDestroyed()) win.hide()
  })
}

function destroyTray() {
  if (tray && !tray.isDestroyed()) tray.destroy()
  tray = null
}

module.exports = { createTray, hideToTrayOnMinimize, showWindow, destroyTray }
