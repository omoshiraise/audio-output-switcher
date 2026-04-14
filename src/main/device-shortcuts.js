'use strict';

const fs = require('fs');
const path = require('path');

const CUSTOM_PROTOCOL = 'audio-output-switcher';
const SHORTCUT_FILE_EXTENSION = '.url';
const SHORTCUT_TEMP_DIR = 'audio-output-switcher-shortcuts';

function sanitizeShortcutFileName(value) {
  const sanitized = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();

  return sanitized || 'Audio Device';
}

function buildShortcutUrl(deviceId, displayName) {
  const params = new URLSearchParams({
    deviceId: String(deviceId || ''),
    deviceName: String(displayName || ''),
  });
  return `${CUSTOM_PROTOCOL}://switch?${params.toString()}`;
}

function parseSwitchRequestFromArg(arg) {
  if (!arg || typeof arg !== 'string' || !arg.startsWith(`${CUSTOM_PROTOCOL}://`)) {
    return null;
  }

  try {
    const url = new URL(arg);
    if (url.hostname !== 'switch') {
      return null;
    }

    const deviceId = String(url.searchParams.get('deviceId') || '').trim();
    if (!deviceId) {
      return null;
    }

    return {
      deviceId,
      deviceName: String(url.searchParams.get('deviceName') || '').trim(),
    };
  } catch (error) {
    return null;
  }
}

function parseSwitchRequestFromCommandLine(commandLine = []) {
  for (const arg of commandLine) {
    const request = parseSwitchRequestFromArg(arg);
    if (request) {
      return request;
    }
  }
  return null;
}

function getShortcutIconPath(iconPath) {
  if (typeof iconPath === 'string' && iconPath.trim()) {
    return iconPath;
  }

  return process.execPath;
}

function writeShortcutFile({ app, iconPath, deviceId, displayName }) {
  const shortcutDir = path.join(app.getPath('temp'), SHORTCUT_TEMP_DIR);
  fs.mkdirSync(shortcutDir, { recursive: true });

  const safeName = sanitizeShortcutFileName(displayName);
  const shortcutPath = path.join(shortcutDir, `${safeName}${SHORTCUT_FILE_EXTENSION}`);
  const shortcutContents = [
    '[InternetShortcut]',
    `URL=${buildShortcutUrl(deviceId, displayName)}`,
    `IconFile=${getShortcutIconPath(iconPath)}`,
    'IconIndex=0',
    '',
  ].join('\r\n');

  fs.writeFileSync(shortcutPath, shortcutContents, 'utf8');
  return shortcutPath;
}

function registerCustomProtocol(app, argv = process.argv) {
  if (process.defaultApp && argv.length >= 2) {
    app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL, process.execPath, [path.resolve(argv[1])]);
    return;
  }

  app.setAsDefaultProtocolClient(CUSTOM_PROTOCOL);
}

module.exports = {
  CUSTOM_PROTOCOL,
  getShortcutIconPath,
  parseSwitchRequestFromCommandLine,
  registerCustomProtocol,
  writeShortcutFile,
};
