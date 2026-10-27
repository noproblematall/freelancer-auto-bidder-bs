'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  versions: process.versions,
  license: {
    activate: (key) => ipcRenderer.invoke('license:activate', { key }),
    startTrial: () => ipcRenderer.invoke('license:startTrial'),
    validate: () => ipcRenderer.invoke('license:validate'),
    deactivate: () => ipcRenderer.invoke('license:deactivate'),
    status: () => ipcRenderer.invoke('license:status'),
  },
  app: {
    relaunch: () => ipcRenderer.invoke('app:relaunch'),
    openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  },
})
