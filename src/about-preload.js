'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aboutAPI', {
  getAboutData: () => ipcRenderer.invoke('about:get'),
});
