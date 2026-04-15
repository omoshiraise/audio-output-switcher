# Audio Output Switcher

[English](README.md) | [日本語](README.ja.md)

An audio output device switcher for Windows 10/11.
Among many similar tools, this one was built to feel just right.
You can easily switch the default audio output device from the tray icon.
You can also assign devices to hotkeys and switch them by keyboard.
Display names (aliases) can be set for each device to make selection intuitive.
Rarely used devices can be hidden to reduce menu clutter.
You can still assign hotkeys to hidden devices, which is useful when you want to select devices that are not part of your usual menu choices only for specific tasks.
You can also place shortcuts on the desktop or elsewhere that switch directly to a specific device.

## Features

- Switch devices from the tray icon
- Hide or set aliases for devices in the settings dialog
- Assign per-device global hotkeys from settings
- Set a different tray icon for each device so the selected device is easy to identify visually
- Place per-device shortcuts on the desktop or elsewhere so you can switch devices even without relying on the tray icon
- Keep hotkey/alias/visibility settings even if a device is temporarily unavailable
- Apply hotkeys to hidden devices as well (unavailable devices are ignored)
- Detect and show hotkey conflicts with other apps
- Optional startup registration
- Small popup notification (no system notification sound)

## Notes

- Depending on your environment (for example, a corporate-managed endpoint),
  the app may not work due to PowerShell execution restrictions.

## Installation

- Run the installer `.exe` file to install the application.
  After a successful install, a desktop shortcut is created and the app starts running.
  If you plan to use it continuously, click the tray icon, open **Settings...**, and enable **Launch at startup**.
- The installer is not code-signed, so you may see a "Windows protected your PC" SmartScreen warning.
  If that happens, click **More info** and then click the **Run anyway** button.
  For your safety, please only use an installer you downloaded from the official source.

## Usage

1. When you launch the app, a tray icon will appear.
  - We recommend enabling it in Windows Settings > Personalization > Taskbar > Other system tray icons to keep it visible.
2. Click the tray icon to open the context menu.
3. Select the device you want to switch to.
4. To change settings, select "Settings...".

### Settings Dialog

- **Visible**: Show/hide devices in the tray menu
- **Display Name**: Set an alias for the device
- **Hotkey**: Assign a direct-switch hotkey for each device (e.g. None, Ctrl+Alt+Home, Shift+Alt+PageUp, etc.)
- **Hotkeys Enabled**: Enable/disable global hotkeys
- **Launch at startup**: Register/unregister startup
- **Refresh**: Reload the device list
- **Save and Close**: Save settings and apply immediately

### Hotkey Behavior

- Duplicate per-device hotkeys are resolved by last selection (previous assignment becomes `None`)
- Per-device hotkeys can switch hidden devices
- Per-device hotkeys ignore unavailable devices
- `Ctrl+Alt+Up/Down` device cycling remains available when hotkeys are enabled

## System Requirements

- Windows 10/11
- PowerShell 5.1 or higher

## Development

### Running in development

```bash
npm install
npm start
```

### Building

```bash
npm run make
```

### Project Structure

```
src/
├── assets/
│   └── icons/
│       └── speaker_tray.svg
├── main/
│   ├── main.js               # Electron main process entry
│   ├── audio-selector.js     # Audio device operations
│   ├── tray-icon-manager.js  # Tray icon loading/rendering
│   └── tray-popup.js         # Small popup window controller
├── preload/
│   ├── about-preload.js
│   ├── popup-preload.js
│   └── settings-preload.js
├── renderer/
│   ├── about/
│   │   └── about.html
│   ├── popup/
│   │   └── popup.html
│   └── settings/
│       ├── color-popover.js
│       └── settings.html
└── shared/
  └── locales/
    └── *.json
```

### Technical Specifications

- Electron + Electron Forge
- Windows Audio API operations using PowerShell + C# (dynamic compilation)
- Settings persistence using JSON files (`device-settings.json`)

## License

MIT License

## Author

Omoshiraise LLC (https://www.omoshiraise.com)
