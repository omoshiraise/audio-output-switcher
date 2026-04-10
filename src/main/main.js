'use strict';

const { app, Tray, Menu, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const i18n = require('i18next');
const { AudioSelector } = require('./audio-selector');
const TrayPopup = require('./tray-popup');
const TrayIconManager = require('./tray-icon-manager');

const SQUIRREL_COMMANDS = new Set([
  '--squirrel-install',
  '--squirrel-updated',
  '--squirrel-uninstall',
  '--squirrel-obsolete',
]);

function getSquirrelCommand(commandLine = process.argv) {
  return commandLine.find(arg => SQUIRREL_COMMANDS.has(arg)) || null;
}

function runSquirrelUpdate(commandLine = process.argv) {
  const squirrelCommand = getSquirrelCommand(commandLine);
  if (!squirrelCommand) {
    return false;
  }

  const appExecutablePath = commandLine[0] || process.execPath;
  const updateExePath = path.resolve(path.dirname(appExecutablePath), '..', 'Update.exe');
  const targetExeName = path.basename(appExecutablePath);

  if (squirrelCommand === '--squirrel-obsolete') {
    app.quit();
    return true;
  }

  let updateArgs;
  if (squirrelCommand === '--squirrel-install' || squirrelCommand === '--squirrel-updated') {
    updateArgs = ['--createShortcut', targetExeName];
  } else if (squirrelCommand === '--squirrel-uninstall') {
    updateArgs = ['--removeShortcut', targetExeName];
  } else {
    return false;
  }

  try {
    childProcess.spawn(updateExePath, updateArgs, { detached: true });
  } catch (error) {
    console.error('Failed to handle Squirrel event:', error);
  }

  setTimeout(() => {
    app.quit();
  }, 1000);
  return true;
}

app.setAppUserModelId('com.audio-tray-switcher');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}

app.on('second-instance', (_event, commandLine) => {
  if (runSquirrelUpdate(commandLine)) {
    return;
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
  }
});

app.on('window-all-closed', () => {});

if (runSquirrelUpdate(process.argv)) {
  return;
}

let tray = null;
let settingsWindow = null;
let aboutWindow = null;
let deviceSettings = null;
let currentMenu = null;
let currentMenuSignature = null;
let refreshInProgress = false;
let currentLocale = 'en';
const HOTKEY_NONE_VALUE = '__none__';

function normalizeHotkey(value) {
  let hotkey = String(value || '').trim();
  if (!hotkey || hotkey === HOTKEY_NONE_VALUE) {
    return HOTKEY_NONE_VALUE;
  }
  return hotkey;
}

function normalizeIconColor(value) {
  const color = String(value || '').trim();
  if (!color) {
    return '';
  }
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '';
}

const selector = new AudioSelector();
const popup = new TrayPopup();

// Initialize i18next
i18n.init({
  lng: 'en', // default language
  fallbackLng: 'en',
  resources: {
    ja: {
      translation: require('../shared/locales/ja.json')
    },
    en: {
      translation: require('../shared/locales/en.json')
    },
    'zh-TW': {
      translation: require('../shared/locales/zh-TW.json')
    },
    'zh-CN': {
      translation: require('../shared/locales/zh-CN.json')
    },
    ko: {
      translation: require('../shared/locales/ko.json')
    },
    it: {
      translation: require('../shared/locales/it.json')
    },
    de: {
      translation: require('../shared/locales/de.json')
    },
    fr: {
      translation: require('../shared/locales/fr.json')
    },
    es: {
      translation: require('../shared/locales/es.json')
    },
    pt: {
      translation: require('../shared/locales/pt.json')
    },
    ru: {
      translation: require('../shared/locales/ru.json')
    }
  }
});

function getAppLocale() {
  const locale = app.getLocale();
  if (locale && locale.startsWith('ja')) return 'ja';
  if (locale && (locale === 'zh-TW' || locale.includes('Taiwan'))) return 'zh-TW';
  if (locale && (locale === 'zh-CN' || locale === 'zh' || locale.startsWith('zh-'))) return 'zh-CN';
  if (locale && locale.startsWith('ko')) return 'ko';
  if (locale && locale.startsWith('it')) return 'it';
  if (locale && locale.startsWith('de')) return 'de';
  if (locale && locale.startsWith('fr')) return 'fr';
  if (locale && locale.startsWith('es')) return 'es';
  if (locale && locale.startsWith('pt')) return 'pt';
  if (locale && locale.startsWith('ru')) return 'ru';
  return 'en';
}

const ICON_DATA_URL =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAaklEQVR42mOQktL7P5CYYdQB' +
  'ow4YdcCoA0YdgE/ywYP/KJgYA2vy/1cMqANIdQRJDsDmCKBld0CYXEeQ7ABiHTG8HYDuiAFx' +
  'ALIjBtQBA5IICWVNmmZDItJDxWhdMOqAUQeMOmDUAUPKAQBjFD14VY6/LgAAAABJRU5ErkJg' +
  'gg==';

const trayIconManager = new TrayIconManager({
  baseDir: __dirname,
  svgPath: path.join(__dirname, '..', 'assets', 'icons', 'speaker_tray.svg'),
  fallbackDataUrl: ICON_DATA_URL,
  defaultColor: '#e575ff',
  renderWidth: 64,
  trayIconWidth: 16,
  trayIconHeight: 16,
});

function getSettingsFilePath() {
  return path.join(app.getPath('userData'), 'device-settings.json');
}

function loadDeviceSettings() {
  if (deviceSettings !== null) {
    return deviceSettings;
  }

  const settingsPath = getSettingsFilePath();
  try {
    const json = fs.readFileSync(settingsPath, 'utf8');
    deviceSettings = JSON.parse(json);
  } catch (err) {
    deviceSettings = { devices: {}, hotkeysEnabled: false, startupEnabled: false };
  }

  if (!deviceSettings.devices || typeof deviceSettings.devices !== 'object') {
    deviceSettings.devices = {};
  }
  if (typeof deviceSettings.hotkeysEnabled !== 'boolean') {
    deviceSettings.hotkeysEnabled = false;
  }

  if (typeof deviceSettings.startupEnabled !== 'boolean') {
    deviceSettings.startupEnabled = false;
  }

  // Ensure each device has a normalized hotkey value.
  Object.keys(deviceSettings.devices).forEach(id => {
    if (!deviceSettings.devices[id] || typeof deviceSettings.devices[id] !== 'object') {
      deviceSettings.devices[id] = { alias: '', hidden: false, hotkey: HOTKEY_NONE_VALUE, iconColor: '' };
      return;
    }
    if (!deviceSettings.devices[id].hotkey) {
      deviceSettings.devices[id].hotkey = HOTKEY_NONE_VALUE;
    } else {
      deviceSettings.devices[id].hotkey = normalizeHotkey(deviceSettings.devices[id].hotkey);
    }
    deviceSettings.devices[id].iconColor = normalizeIconColor(deviceSettings.devices[id].iconColor);
  });

  return deviceSettings;
}

function saveDeviceSettings() {
  const settingsPath = getSettingsFilePath();
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(settingsPath, JSON.stringify(deviceSettings, null, 2), 'utf8');
}

function getMergedDeviceList(currentDevices) {
  loadDeviceSettings();
  const currentMap = new Map(currentDevices.map(device => [device.id, device]));
  const savedIds = Object.keys(deviceSettings.devices);
  const mergedIds = new Set([...currentMap.keys(), ...savedIds]);

  const merged = [];
  mergedIds.forEach(id => {
    const current = currentMap.get(id);
    const settings = deviceSettings.devices[id] || { alias: '', hidden: false, hotkey: HOTKEY_NONE_VALUE, iconColor: '' };
    const name = current ? current.name : (settings.alias || '不明なデバイス');
    merged.push({
      id,
      name,
      alias: settings.alias || '',
      hidden: Boolean(settings.hidden),
      hotkey: settings.hotkey || HOTKEY_NONE_VALUE,
      iconColor: normalizeIconColor(settings.iconColor),
      available: Boolean(current),
    });
  });

  merged.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  return merged;
}

function getSettingsTexts() {
  return {
    title: i18n.t('title'),
    description: i18n.t('description'),
    hotkeysLabel: i18n.t('hotkeysLabel'),
    startupLabel: i18n.t('startupLabel'),
    deviceNameHeader: i18n.t('deviceNameHeader'),
    visibleHeader: i18n.t('visibleHeader'),
    displayNameHeader: i18n.t('displayNameHeader'),
    hotkeyHeader: i18n.t('hotkeyHeader'),
    iconColorHeader: i18n.t('iconColorHeader', { defaultValue: 'Icon Color' }),
    selectColor: i18n.t('selectColor'),
    clearColor: i18n.t('clearColor'),
    colorApply: i18n.t('colorApply'),
    unknownDevice: i18n.t('unknownDevice'),
    unavailableSuffix: i18n.t('unavailableSuffix'),
    noneHotkey: i18n.t('noneHotkey'),
    refresh: i18n.t('refresh'),
    saveAndClose: i18n.t('saveAndClose'),
    close: i18n.t('close'),
    noDevices: i18n.t('noDevices'),
    saved: i18n.t('saved'),
    refreshed: i18n.t('refreshed'),
    saveErrorPrefix: i18n.t('saveErrorPrefix'),
    loadErrorPrefix: i18n.t('loadErrorPrefix'),
  };
}

function getAboutTexts() {
  return {
    aboutTitle: i18n.t('aboutTitle'),
    version: i18n.t('versionLabel'),
    packageHeader: i18n.t('packageHeader'),
    licenseHeader: i18n.t('licenseHeader'),
    repositoryHeader: i18n.t('repositoryHeader'),
    ossNotice: i18n.t('ossNotice'),
    noLicenses: i18n.t('noLicenses'),
    close: i18n.t('close'),
    loadError: i18n.t('aboutLoadError'),
  };
}

function getLicensesFilePath() {
  return path.join(__dirname, '..', '..', 'licenses.json');
}

function readLicenseEntries() {
  const licensePath = getLicensesFilePath();
  if (!fs.existsSync(licensePath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(licensePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Object.entries(parsed)
      .map(([packageName, details]) => ({
        packageName,
        licenses: details && details.licenses ? String(details.licenses) : 'Unknown',
        repository: details && details.repository ? String(details.repository) : '',
      }))
      .sort((a, b) => a.packageName.localeCompare(b.packageName, 'en'));
  } catch (err) {
    console.error('Failed to parse licenses.json:', err);
    return [];
  }
}

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  const settingsWindowTitle = `${app.getName()} v${app.getVersion()}}`;

  settingsWindow = new BrowserWindow({
    width: 620,
    height: 680,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: settingsWindowTitle,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  settingsWindow.setMenu(null);
  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings', 'settings.html')).catch(err => {
    console.error('Failed to load settings.html:', err);
    settingsWindow.close();
    settingsWindow = null;
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function openAboutWindow() {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return;
  }

  const aboutWindowTitle = `${app.getName()} v${app.getVersion()}`;

  aboutWindow = new BrowserWindow({
    width: 620,
    height: 680,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: aboutWindowTitle,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'about-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  aboutWindow.setMenu(null);
  aboutWindow.loadFile(path.join(__dirname, '..', 'renderer', 'about', 'about.html')).catch(err => {
    console.error('Failed to load about.html:', err);
    aboutWindow.close();
    aboutWindow = null;
  });

  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
}

function refreshSettingsWindow() {
  if (!settingsWindow || settingsWindow.isDestroyed()) return;
  settingsWindow.webContents.send('settings:refresh-request');
}

async function switchDeviceById(deviceId, fallbackName = '') {
  const result = await selector.EnumAudioDevice();
  const mergedDevices = getMergedDeviceList(result.devices);
  const targetDevice = mergedDevices.find(device => device.id === deviceId);

  if (!targetDevice || !targetDevice.available) {
    await refreshMenu();
    popup.show(i18n.t('deviceDisconnected', {
      device: fallbackName || deviceId
    }));
    return false;
  }

  await selector.SelectAudioDevice(targetDevice.id);
  await refreshMenu();
  popup.show(i18n.t('audioOutputChanged', { device: targetDevice.alias || targetDevice.name }));
  return true;
}

async function setupHotkeys() {
  if (!deviceSettings.hotkeysEnabled) return;

  teardownHotkeys();

  const result = await selector.EnumAudioDevice();
  const mergedDevices = getMergedDeviceList(result.devices);
  const availableDevices = mergedDevices.filter(d => d.available);

  let conflictMessage = '';

  // Register individual hotkeys
  availableDevices.forEach(device => {
    let hotkey = device.hotkey;
    if (hotkey && hotkey !== HOTKEY_NONE_VALUE) {
      hotkey = normalizeHotkey(hotkey);
      if (globalShortcut.isRegistered(hotkey)) {
        globalShortcut.unregister(hotkey);
      }
      const success = globalShortcut.register(hotkey, async () => {
        try {
          await switchDeviceById(device.id, device.alias || device.name);
        } catch (err) {
          console.error('Hotkey switch failed:', err);
        }
      });
      if (success) {
        registeredHotkeys.push(hotkey);
      } else {
        conflictMessage += `${hotkey} は既に使用されています。`;
      }
    }
  });

  // Register Up/Down for navigation
  const accelerators = ['Ctrl+Alt+Up', 'Ctrl+Alt+Down'];
  accelerators.forEach(accel => {
    if (globalShortcut.isRegistered(accel)) {
      globalShortcut.unregister(accel);
    }
    const success = globalShortcut.register(accel, async () => {
      try {
        const result = await selector.EnumAudioDevice();
        const mergedDevices = getMergedDeviceList(result.devices);
        const visibleDevices = mergedDevices.filter(d => d.available && !d.hidden);
        if (visibleDevices.length === 0) return;

        const currentIndex = visibleDevices.findIndex(d => d.id === result.defaultDeviceId);
        let nextIndex;
        if (accel === 'Ctrl+Alt+Up') {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : visibleDevices.length - 1;
        } else {
          nextIndex = currentIndex < visibleDevices.length - 1 ? currentIndex + 1 : 0;
        }
        const nextDevice = visibleDevices[nextIndex];
        await selector.SelectAudioDevice(nextDevice.id);
        await refreshMenu();

        const notificationTitle = i18n.t('audioOutputChanged', { device: nextDevice.alias || nextDevice.name });
        popup.show(notificationTitle);
      } catch (err) {
        console.error('Hotkey switch failed:', err);
      }
    });
    if (success) {
      registeredHotkeys.push(accel);
    } else {
      conflictMessage += `${accel} は既に使用されています。`;
    }
  });

  if (conflictMessage) {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('hotkey:conflict', conflictMessage);
    }
  }
}

let registeredHotkeys = [];

function teardownHotkeys() {
  registeredHotkeys.forEach(accel => {
    globalShortcut.unregister(accel);
  });
  registeredHotkeys = [];
}

function createMenuSignature(template) {
  return JSON.stringify(template.map(item => ({
    label: item.label || null,
    type: item.type || null,
    enabled: Boolean(item.enabled),
  })));
}

async function buildMenuTemplate() {
  let result;
  try {
    result = await selector.EnumAudioDevice();
  } catch (err) {
    const menu = [
      { label: i18n.t('deviceFetchFailed'), enabled: false },
      { label: err.message.slice(0, 120), enabled: false },
      { type: 'separator' },
      { label: i18n.t('settings'), click: openSettingsWindow },
      { type: 'separator' },
      { label: i18n.t('exit'), click: () => app.quit() },
    ];
    return { menu, defaultDeviceName: i18n.t('deviceFetchFailed'), defaultIconColor: '' };
  }

  const mergedDevices = getMergedDeviceList(result.devices);
  const visibleDevices = mergedDevices.filter(device => device.available && !device.hidden);

  const defaultDevice = mergedDevices.find(device => device.id === result.defaultDeviceId);
  const defaultDeviceName = defaultDevice ? (defaultDevice.alias || defaultDevice.name) : '不明なデバイス';
  const defaultIconColor = defaultDevice ? normalizeIconColor(defaultDevice.iconColor) : '';

  const deviceItems = visibleDevices.map(device => {
    const isDefault = device.id === result.defaultDeviceId;
    const marker = isDefault ? '┃ ' : '  ';
    const label = `${marker}${device.alias || device.name}`;

    return {
      label,
      click: async () => {
        if (isDefault) return;
        try {
          await selector.SelectAudioDevice(device.id);
        } catch (err) {
          console.error('SelectAudioDevice:', err.message);
        }
        await refreshMenu();
      },
    };
  });

  const menu = [
    { label: i18n.t('aboutMenuLabel', { appName: app.getName() }), click: openAboutWindow },
    { label: i18n.t('settings'), click: openSettingsWindow },
    { type: 'separator' },
  ];

  if (deviceItems.length) {
    menu.push(...deviceItems);
  } else {
    menu.push({ label: i18n.t('noVisibleDevices'), enabled: false });
  }

  menu.push(
    { type: 'separator' },
    { label: i18n.t('exit'), click: () => app.quit() }
  );

  return { menu, defaultDeviceName, defaultIconColor };
}

async function refreshMenu() {
  if (!tray) return;
  const { menu: template, defaultDeviceName, defaultIconColor } = await buildMenuTemplate();
  currentMenu = Menu.buildFromTemplate(template);
  currentMenuSignature = createMenuSignature(template);
  tray.setContextMenu(currentMenu);
  tray.setImage(trayIconManager.buildIcon(defaultIconColor));
  tray.setToolTip(`${i18n.t('tooltipPrefix')}${defaultDeviceName}`);
}

async function refreshMenuIfChanged() {
  if (!tray || refreshInProgress) return false;
  refreshInProgress = true;
  try {
    const { menu: template, defaultDeviceName, defaultIconColor } = await buildMenuTemplate();
    const signature = createMenuSignature(template);
    if (signature !== currentMenuSignature) {
      currentMenu = Menu.buildFromTemplate(template);
      currentMenuSignature = signature;
      tray.setContextMenu(currentMenu);
      refreshSettingsWindow();
      tray.setImage(trayIconManager.buildIcon(defaultIconColor));
      tray.setToolTip(`${i18n.t('tooltipPrefix')}${defaultDeviceName}`);
      return true;
    }
    tray.setImage(trayIconManager.buildIcon(defaultIconColor));
    tray.setToolTip(`${i18n.t('tooltipPrefix')}${defaultDeviceName}`);
    return false;
  } finally {
    refreshInProgress = false;
  }
}

ipcMain.handle('settings:get', async () => {
  loadDeviceSettings();
  let result;
  try {
    result = await selector.EnumAudioDevice();
  } catch (err) {
    result = { devices: [] };
  }

  return {
    devices: getMergedDeviceList(result.devices),
    hotkeysEnabled: deviceSettings.hotkeysEnabled,
    startupEnabled: deviceSettings.startupEnabled,
    locale: currentLocale,
    texts: getSettingsTexts(),
  };
});

ipcMain.handle('settings:refresh', async () => {
  const result = await selector.EnumAudioDevice();
  return {
    devices: getMergedDeviceList(result.devices),
  };
});

ipcMain.handle('settings:update', async (_event, updates) => {
  loadDeviceSettings();
  const deviceUpdates = Array.isArray(updates)
    ? updates
    : (Array.isArray(updates && updates.deviceUpdates) ? updates.deviceUpdates : []);

  deviceUpdates.forEach(update => {
    const id = update.id;
    if (!deviceSettings.devices[id]) {
      deviceSettings.devices[id] = { alias: '', hidden: false, hotkey: HOTKEY_NONE_VALUE, iconColor: '' };
    }
    deviceSettings.devices[id].hidden = Boolean(update.hidden);
    deviceSettings.devices[id].alias = String(update.alias || '').trim();
    deviceSettings.devices[id].hotkey = normalizeHotkey(update.hotkey);
    deviceSettings.devices[id].iconColor = normalizeIconColor(update.iconColor);
  });

  if (updates.hotkeysEnabled !== undefined) {
    deviceSettings.hotkeysEnabled = Boolean(updates.hotkeysEnabled);
  }
  if (updates.startupEnabled !== undefined) {
    deviceSettings.startupEnabled = Boolean(updates.startupEnabled);
    app.setLoginItemSettings({ openAtLogin: deviceSettings.startupEnabled, path: process.execPath });
  }
  saveDeviceSettings();
  teardownHotkeys();
  await setupHotkeys();
  await refreshMenu();
  return { success: true };
});

ipcMain.handle('about:get', async () => {
  return {
    appName: app.getName(),
    version: app.getVersion(),
    licenses: readLicenseEntries(),
    texts: getAboutTexts(),
  };
});

app.whenReady().then(async () => {
  currentLocale = getAppLocale();
  i18n.changeLanguage(currentLocale);
  loadDeviceSettings();

  app.setLoginItemSettings({ openAtLogin: deviceSettings.startupEnabled, path: process.execPath });

  tray = new Tray(trayIconManager.buildIcon(''));
  popup.init(tray);
  const showMenu = async () => {
    tray.popUpContextMenu();
    try {
      const updated = await refreshMenuIfChanged();
      if (updated) {
        tray.popUpContextMenu(currentMenu);
      }
    } catch (err) {
      console.error('refreshMenuIfChanged:', err);
    }
  };

  tray.on('click', showMenu);
  tray.on('right-click', showMenu);

  await setupHotkeys();

  await refreshMenu();
});

// 正常終了時
app.on('will-quit', () => {
  teardownHotkeys();
  popup.destroy();
});
