'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('keygen', {
  list: () => ipcRenderer.invoke('devices:list'),
  add: (data) => ipcRenderer.invoke('devices:add', data),
  remove: (device) => ipcRenderer.invoke('devices:remove', device),
  copyKey: (device) => ipcRenderer.invoke('key:copy', device),
  saveKey: (device) => ipcRenderer.invoke('key:save', device),
})
