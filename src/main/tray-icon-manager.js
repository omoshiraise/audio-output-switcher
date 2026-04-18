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

  _loadBaseIcon(iconName = '') {
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

  buildIcon(iconName = '') {
    return this._loadBaseIcon(iconName);
  }

  buildMenuItemIcon(iconName = '', options = {}) {
    const normalizedIconName = String(iconName || '').trim() || this.defaultIconName;
    const isSelected = Boolean(options.selected);
    const cacheKey = `menu:${normalizedIconName}:${isSelected ? 'selected' : 'plain'}`;
    if (this.iconCache.has(cacheKey)) {
      return this.iconCache.get(cacheKey);
    }

    const sourceIcon = this._loadBaseIcon(normalizedIconName);
    if (sourceIcon.isEmpty()) {
      return sourceIcon;
    }

    const iconWidth = this.trayIconWidth;
    const iconHeight = this.trayIconHeight;
    const canvasWidth = iconWidth + 8;
    const canvasHeight = iconHeight;
    const iconOffsetX = 8;
    const iconOffsetY = 0;
    const barWidth = 2;
    const barX = 2;
    const barInsetY = 1;
    const barColor = { r: 0x2f, g: 0x67, b: 0xad, a: 0xff };
    const output = Buffer.alloc(canvasWidth * canvasHeight * 4, 0);
    const source = sourceIcon.toBitmap();

    if (isSelected) {
      for (let y = barInsetY; y < canvasHeight - barInsetY; y += 1) {
        for (let x = barX; x < barX + barWidth; x += 1) {
          const offset = (y * canvasWidth + x) * 4;
          output[offset] = barColor.b;
          output[offset + 1] = barColor.g;
          output[offset + 2] = barColor.r;
          output[offset + 3] = barColor.a;
        }
      }
    }

    for (let y = 0; y < iconHeight; y += 1) {
      for (let x = 0; x < iconWidth; x += 1) {
        const srcOffset = (y * iconWidth + x) * 4;
        const alpha = source[srcOffset + 3];
        if (alpha === 0) {
          continue;
        }

        const destOffset = ((y + iconOffsetY) * canvasWidth + (x + iconOffsetX)) * 4;
        output[destOffset] = source[srcOffset];
        output[destOffset + 1] = source[srcOffset + 1];
        output[destOffset + 2] = source[srcOffset + 2];
        output[destOffset + 3] = alpha;
      }
    }

    const menuIcon = nativeImage.createFromBitmap(output, {
      width: canvasWidth,
      height: canvasHeight,
    });
    this.iconCache.set(cacheKey, menuIcon);
    return menuIcon;
  }
}

module.exports = TrayIconManager;
