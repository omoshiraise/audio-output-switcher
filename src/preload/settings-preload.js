'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  refreshSettings: () => ipcRenderer.invoke('settings:refresh'),
  updateSettings: (updates) => ipcRenderer.invoke('settings:update', updates),
  startShortcutDrag: (payload) => ipcRenderer.send('shortcut:drag-start', payload),
  onRefreshRequest: (callback) => {
    ipcRenderer.on('settings:refresh-request', callback);
  },
  onHotkeyConflict: (callback) => {
    ipcRenderer.on('hotkey:conflict', callback);
  },
});
