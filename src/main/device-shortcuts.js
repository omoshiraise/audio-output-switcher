'use strict';

const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

const CUSTOM_PROTOCOL = 'audio-output-switcher';
const SHORTCUT_FILE_EXTENSION = '.lnk';
const SHORTCUT_TEMP_DIR = 'audio-output-switcher-shortcuts';

function sanitizeShortcutFileName(value) {
  const sanitized = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();

  return sanitized || 'Audio Device';
}

function buildShortcutUrl(internalId, displayName) {
  const params = new URLSearchParams({
    internalId: String(internalId || ''),
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

    const internalId = String(url.searchParams.get('internalId') || '').trim();
    if (internalId) {
      return {
        internalId,
        deviceName: String(url.searchParams.get('deviceName') || '').trim(),
      };
    }

    const legacyDeviceId = String(url.searchParams.get('deviceId') || '').trim();
    return legacyDeviceId ? { legacyShortcut: true } : null;
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

function getRootExecutablePath() {
  const currentExecPath = process.execPath;
  const execDirName = path.basename(path.dirname(currentExecPath));
  if (execDirName.startsWith('app-')) {
    return path.join(path.dirname(path.dirname(currentExecPath)), path.basename(currentExecPath));
  }
  return currentExecPath;
}

function writeShortcutFile({ app, iconPath, internalId, displayName }) {
  if (!app.isPackaged) {
    throw new Error('Shortcut creation is only supported in packaged builds.');
  }

  const shortcutDir = path.join(app.getPath('temp'), SHORTCUT_TEMP_DIR);
  fs.mkdirSync(shortcutDir, { recursive: true });

  const safeName = sanitizeShortcutFileName(displayName);
  const shortcutPath = path.join(shortcutDir, `${safeName}${SHORTCUT_FILE_EXTENSION}`);

  if (process.platform !== 'win32') {
    throw new Error('Shortcut creation is supported only on Windows.');
  }

  const shortcutUrl = buildShortcutUrl(internalId, displayName);
  const targetPath = getRootExecutablePath();
  const workingDir = path.dirname(targetPath);

  const success = shell.writeShortcutLink(shortcutPath, 'create', {
    target: targetPath,
    args: shortcutUrl,
    icon: getShortcutIconPath(iconPath),
    iconIndex: 0,
    description: displayName,
    workingDirectory: workingDir,
  });

  if (!success) {
    throw new Error(`Failed to create Windows shortcut: ${shortcutPath}`);
  }

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
