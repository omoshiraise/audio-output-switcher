'use strict';

const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');
const { Resvg } = require('@resvg/resvg-js');

class TrayIconManager {
  constructor(options = {}) {
    this.baseDir = options.baseDir || __dirname;
    this.svgPath = options.svgPath || path.join(this.baseDir, '..', 'assets', 'icons', 'speaker_tray.svg');
    this.fallbackDataUrl = options.fallbackDataUrl || '';
    this.defaultColor = options.defaultColor || '#e575ff';
    this.renderWidth = options.renderWidth || 64;
    this.trayIconWidth = options.trayIconWidth || 16;
    this.trayIconHeight = options.trayIconHeight || 16;

    this.iconCache = new Map();
    this.svgTemplate = null;
  }

  normalizeColor(value) {
    const color = String(value || '').trim();
    if (!color) {
      return '';
    }
    return /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '';
  }

  getSvgTemplate() {
    if (this.svgTemplate !== null) {
      return this.svgTemplate;
    }

    if (!fs.existsSync(this.svgPath)) {
      this.svgTemplate = '';
      return this.svgTemplate;
    }

    try {
      this.svgTemplate = fs.readFileSync(this.svgPath, 'utf8');
    } catch (err) {
      console.warn('Failed to read tray SVG template:', err && err.message ? err.message : err);
      this.svgTemplate = '';
    }

    return this.svgTemplate;
  }

  applyColor(svgTemplate, iconColor) {
    const normalizedColor = this.normalizeColor(iconColor) || this.defaultColor;
    return svgTemplate.replace(/<rect\b[^>]*\bid="rect15"[^>]*>/, rectTag => {
      if (/style="[^"]*fill:/i.test(rectTag)) {
        return rectTag.replace(/(style="[^"]*fill:)(#[0-9A-Fa-f]{6})/i, `$1${normalizedColor}`);
      }
      if (/\sfill="#[0-9A-Fa-f]{6}"/i.test(rectTag)) {
        return rectTag.replace(/(\sfill=")(#[0-9A-Fa-f]{6})(")/i, `$1${normalizedColor}$3`);
      }
      return rectTag;
    });
  }

  buildIcon(iconColor = '') {
    const normalizedColor = this.normalizeColor(iconColor) || this.defaultColor;
    const cacheKey = `svg-rendered:${normalizedColor}`;
    if (this.iconCache.has(cacheKey)) {
      return this.iconCache.get(cacheKey);
    }

    const svgTemplate = this.getSvgTemplate();
    if (svgTemplate) {
      try {
        const coloredSvg = this.applyColor(svgTemplate, normalizedColor);
        const renderedPng = new Resvg(coloredSvg, {
          fitTo: {
            mode: 'width',
            value: this.renderWidth,
          },
        }).render().asPng();

        const icon = nativeImage.createFromBuffer(Buffer.from(renderedPng)).resize({
          width: this.trayIconWidth,
          height: this.trayIconHeight,
          quality: 'best',
        });

        if (!icon.isEmpty()) {
          this.iconCache.set(cacheKey, icon);
          return icon;
        }
      } catch (err) {
        console.warn('Failed to render tray icon from SVG:', err && err.message ? err.message : err);
      }
    }

    if (this.fallbackDataUrl) {
      const fallbackIcon = nativeImage.createFromDataURL(this.fallbackDataUrl).resize({
        width: this.trayIconWidth,
        height: this.trayIconHeight,
        quality: 'best',
      });

      if (!fallbackIcon.isEmpty()) {
        this.iconCache.set(cacheKey, fallbackIcon);
        return fallbackIcon;
      }
    }

    console.warn('Failed to create tray icon base image.');
    return nativeImage.createEmpty();
  }
}

module.exports = TrayIconManager;
