// TrayPopup.js
const { BrowserWindow, screen } = require('electron');
const path = require('path');

class TrayPopup {
  constructor(options = {}) {
    this.width = options.width ?? 220;
    this.height = options.height ?? 34;
    this.minHeight = options.minHeight ?? 30;
    this.maxHeight = options.maxHeight ?? 52;
    this.minWidth = options.minWidth ?? 64;
    this.maxWidth = options.maxWidth ?? 1600;
    this.duration = options.duration ?? 2500; // 0で自動クローズなし
    this._hideTimer = null;
    this._win = null;
    this._tray = null;
    this._readyPromise = null;
    this._showRequestId = 0;
  }

  // trayはElectronのTrayインスタンスを渡す
  init(tray) {
    this._tray = tray;
    this._win = new BrowserWindow({
      width: this.width,
      height: this.height,
      show: false,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      transparent: true,
      webPreferences: {
        contextIsolation: true,
        preload: path.join(__dirname, 'popup-preload.js'),
      },
    });

    this._readyPromise = new Promise(resolve => {
      this._win.webContents.once('did-finish-load', resolve);
    });

    this._win.loadFile(path.join(__dirname, 'popup.html'));
    this._win.on('blur', () => this.hide());
  }

  async show(message) {
    if (!this._win || !this._tray) return;
    const requestId = ++this._showRequestId;
    const nextMessage = String(message ?? '');

    clearTimeout(this._hideTimer);
    if (this._win.isVisible()) {
      this._win.hide();
    }

    try {
      if (this._readyPromise) {
        await this._readyPromise;
      }
    } catch (_) {
      // did-finish-load待機で失敗しても後続のフォールバック推定で表示する
    }

    if (requestId !== this._showRequestId) {
      return;
    }

    let nextWidth = this._estimatePopupWidth(nextMessage);
    let nextHeight = this._clampHeight(this.height);
    try {
      const escapedMessage = JSON.stringify(nextMessage);
      const measured = await this._win.webContents.executeJavaScript(`(() => {
        const msg = document.getElementById('msg');
        if (!msg) return null;
        msg.textContent = ${escapedMessage};
        const style = window.getComputedStyle(document.body);
        const padL = parseFloat(style.paddingLeft) || 0;
        const padR = parseFloat(style.paddingRight) || 0;
        const padT = parseFloat(style.paddingTop) || 0;
        const padB = parseFloat(style.paddingBottom) || 0;
        const rect = msg.getBoundingClientRect();
        return {
          width: Math.ceil(rect.width + padL + padR + 12),
          height: Math.ceil(rect.height + padT + padB + 3)
        };
      })()`, true);

      if (measured && typeof measured.width === 'number') {
        nextWidth = this._clampWidth(measured.width);
      }
      if (measured && typeof measured.height === 'number') {
        nextHeight = this._clampHeight(measured.height);
      }
    } catch (_) {
      this._win.webContents.send('popup-message', nextMessage);
    }

    nextWidth = this._clampWidth(nextWidth, this._getEffectiveMaxWidth());

    const pos = this._calcPositionForSize(nextWidth, nextHeight);
    this._win.setBounds({ x: pos.x, y: pos.y, width: nextWidth, height: nextHeight }, false);
    this._win.webContents.send('popup-message', nextMessage);
    this._win.showInactive(); // メインウィンドウのフォーカスを奪わない

    if (this.duration > 0) {
      clearTimeout(this._hideTimer);
      this._hideTimer = setTimeout(() => this.hide(), this.duration);
    }
  }

  hide() {
    clearTimeout(this._hideTimer);
    if (this._win && !this._win.isDestroyed()) {
      this._win.webContents.send('popup-message', '');
    }
    this._win?.hide();
  }

  isVisible() {
    return this._win?.isVisible() ?? false;
  }

  toggle(message) {
    this.isVisible() ? this.hide() : this.show(message);
  }

  destroy() {
    clearTimeout(this._hideTimer);
    this._win?.destroy();
    this._win = null;
  }

  _estimatePopupWidth(message) {
    const text = String(message ?? '');
    let px = 12; // 左右余白

    for (const ch of text) {
      const code = ch.codePointAt(0) || 0;
      if (ch === ' ') {
        px += 3;
      } else if (code <= 0x7f) {
        px += 6;
      } else {
        px += 10;
      }
    }

    const estimated = Math.round(px);
    return this._clampWidth(estimated);
  }

  _clampWidth(width, maxWidth = this.maxWidth) {
    return Math.max(this.minWidth, Math.min(maxWidth, width));
  }

  _getEffectiveMaxWidth() {
    try {
      const trayBounds = this._tray && this._tray.getBounds ? this._tray.getBounds() : null;
      const display = this._isTrayBoundsUsable(trayBounds)
        ? screen.getDisplayMatching(trayBounds)
        : screen.getPrimaryDisplay();
      const workWidth = display.workArea && Number.isFinite(display.workArea.width)
        ? display.workArea.width
        : 1920;
      const maxByDisplay = Math.max(this.minWidth, workWidth - 16);
      return Math.min(this.maxWidth, maxByDisplay);
    } catch (_) {
      return this.maxWidth;
    }
  }

  _clampHeight(height) {
    return Math.max(this.minHeight, Math.min(this.maxHeight, height));
  }

  _calcPositionForSize(width, height) {
    const trayBounds = this._tray.getBounds();
    if (!this._isTrayBoundsUsable(trayBounds)) {
      const { workArea } = screen.getPrimaryDisplay();
      return {
        x: Math.max(workArea.x, workArea.x + workArea.width - width - 8),
        y: Math.max(workArea.y, workArea.y + workArea.height - height - 8),
      };
    }

    const { workArea, bounds: screenBounds } = screen.getDisplayMatching(trayBounds);

    // tray 座標が workArea 外を指している場合、実際の通知領域位置として信用できない。
    // (auto-hide / DPI / マルチディスプレイ環境で発生しうる)
    const trayOutsideWorkArea =
      trayBounds.x < workArea.x - 8 ||
      trayBounds.y < workArea.y - 8 ||
      trayBounds.x + trayBounds.width > workArea.x + workArea.width + 8 ||
      trayBounds.y + trayBounds.height > workArea.y + workArea.height + 8;
    if (trayOutsideWorkArea) {
      return {
        x: Math.max(workArea.x, workArea.x + workArea.width - width - 8),
        y: Math.max(workArea.y, workArea.y + workArea.height - height - 8),
      };
    }

    // 一部環境で auto-hide 時に tray が左下(0, bottom) 付近として返る。
    // この値は実際の通知領域位置を表さないため、右下へフォールバックする。
    const isSuspiciousLeftBottomTray =
      trayBounds.x <= workArea.x + 12 &&
      trayBounds.y + trayBounds.height >= workArea.y + workArea.height - 12;
    if (isSuspiciousLeftBottomTray) {
      return {
        x: Math.max(workArea.x, workArea.x + workArea.width - width - 8),
        y: Math.max(workArea.y, workArea.y + workArea.height - height - 8),
      };
    }

    const w = width;
    const h = height;

    const taskbarOnBottom = workArea.y + workArea.height < screenBounds.height;
    const taskbarOnTop    = workArea.y > 0;
    const taskbarOnLeft   = workArea.x > 0;

    let x = Math.round(trayBounds.x + trayBounds.width / 2 - w / 2);
    let y;

    if (taskbarOnBottom) {
      y = trayBounds.y - h - 4;
    } else if (taskbarOnTop) {
      y = trayBounds.y + trayBounds.height + 4;
    } else if (taskbarOnLeft) {
      x = workArea.x + 4;
      y = trayBounds.y;
    } else {
      x = workArea.x + workArea.width - w - 4;
      y = trayBounds.y;
    }

    // 画面外にはみ出さないようにクランプ
    x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - w));
    y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - h));

    // トレイ座標が不安定な環境では左端に寄ることがあるため、怪しい場合は右下へ寄せる
    if ((trayBounds.x <= 8 && trayBounds.y <= 8) || (x <= workArea.x + 8 && y <= workArea.y + 8)) {
      x = Math.max(workArea.x, workArea.x + workArea.width - w - 8);
      y = Math.max(workArea.y, workArea.y + workArea.height - h - 8);
    }

    return { x, y };
  }

  _isTrayBoundsUsable(bounds) {
    if (!bounds) return false;
    const x = Number(bounds.x);
    const y = Number(bounds.y);
    const width = Number(bounds.width);
    const height = Number(bounds.height);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
      return false;
    }

    // 一部環境で未初期化時に 0,0,0,0 が返ることがある
    if (width <= 0 || height <= 0) {
      return false;
    }
    // auto-hide などで 0,0 近辺が返るケースを不正扱いにする
    if (x <= 8 && y <= 8) {
      return false;
    }
    return true;
  }
}

module.exports = TrayPopup;