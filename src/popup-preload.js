'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('popupAPI', {
  onPopupMessage: (callback) => {
    ipcRenderer.on('popup-message', (event, message) => {
      callback(message);
    });
  },
});