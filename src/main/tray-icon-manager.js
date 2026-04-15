'use strict';

const { nativeImage } = require('electron');

class TrayIconManager {
  constructor(options = {}) {
    this.resolveIconPath = typeof options.resolveIconPath === 'function'
      ? options.resolveIconPath
      : (() => '');
    this.defaultIconName = options.defaultIconName || 'speaker_pink';
    this.trayIconWidth = options.trayIconWidth || 16;
    this.trayIconHeight = options.trayIconHeight || 16;
    this.iconCache = new Map();
  }

  buildIcon(iconName = '') {
    const normalizedIconName = String(iconName || '').trim() || this.defaultIconName;
    const cacheKey = `ico:${normalizedIconName}`;
    if (this.iconCache.has(cacheKey)) {
      return this.iconCache.get(cacheKey);
    }

    const iconPath = this.resolveIconPath(normalizedIconName);
    const icon = nativeImage.createFromPath(iconPath).resize({
      width: this.trayIconWidth,
      height: this.trayIconHeight,
      quality: 'best',
    });

    if (!icon.isEmpty()) {
      this.iconCache.set(cacheKey, icon);
      return icon;
    }

    console.warn('Failed to create tray icon from file:', iconPath);
    return nativeImage.createEmpty();
  }
}

module.exports = TrayIconManager;
