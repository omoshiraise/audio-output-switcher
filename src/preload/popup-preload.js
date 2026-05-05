'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('popupAPI', {
  onPopupMessage: (callback) => {
    ipcRenderer.on('popup-message', (event, message) => {
      callback(message);
    });
  },
  onPlaySound: (callback) => {
    ipcRenderer.on('popup-play-sound', (event, soundUrl) => {
      callback(soundUrl);
    });
  },
});
