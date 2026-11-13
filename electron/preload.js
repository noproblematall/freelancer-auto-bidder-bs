'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  versions: process.versions,
  license: {
    activate: (key) => ipcRenderer.invoke('license:activate', { key }),
    deviceNumber: () => ipcRenderer.invoke('license:deviceNumber'),
    pickKeyFile: () => ipcRenderer.invoke('license:pickKeyFile'),
    validate: () => ipcRenderer.invoke('license:validate'),
    deactivate: () => ipcRenderer.invoke('license:deactivate'),
    status: () => ipcRenderer.invoke('license:status'),
  },
  app: {
    relaunch: () => ipcRenderer.invoke('app:relaunch'),
    openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  },
  update: {
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    // Subscribe to status changes; returns an unsubscribe function.
    onStatus: (cb) => {
      const handler = (_e, status) => cb(status)
      ipcRenderer.on('update:status', handler)
      return () => ipcRenderer.removeListener('update:status', handler)
    },
  },
})
