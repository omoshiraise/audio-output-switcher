# Audio Output Switcher

[English](README.md) | [日本語](README.ja.md)

An audio output device switcher for Windows 10/11.
Among many similar tools, this one was built to feel just right.
You can easily switch the default audio output device from the tray icon.
You can also assign devices to hotkeys and switch them by keyboard.
Display names (aliases) can be set for each device to make selection intuitive.
Rarely used devices can be hidden to reduce menu clutter.
You can still assign hotkeys to hidden devices, which is useful when you want to select devices that are not part of your usual menu choices only for specific tasks.

## Features

- Switch devices from the tray icon
- Hide or set aliases for devices in the settings dialog
- Assign per-device global hotkeys from settings
- Keep hotkey/alias/visibility settings even if a device is temporarily unavailable
- Keep hotkeys active for hidden devices (unavailable devices are ignored)
- Detect and show hotkey conflicts
- Optional startup registration
- Small popup notification (no system notification sound)
- Persistent settings
- Automatic updates on device connection/disconnection

## Notes

- Depending on your environment (for example, a corporate-managed endpoint),
  the app may not work due to PowerShell execution restrictions.

## Installation

Run the installer `.exe` file to install the application.

## Usage

1. When you launch the app, a tray icon will appear.
  - We recommend enabling it in Windows Settings > Personalization > Taskbar > Other system tray icons to keep it visible.
2. Click the tray icon to open the context menu.
3. Select the device you want to switch to.
4. To change settings, select "Settings...".

### Settings Dialog

- **Visible**: Show/hide devices in the tray menu
- **Display Name**: Set an alias for the device
- **Hotkey**: Assign a direct-switch hotkey for each device (`None`, `Ctrl+Alt+Home`, `Ctrl+Alt+End`, `Ctrl+Alt+PageUp`, `Ctrl+Alt+PageDown`)
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
├── main.js               # Electron main process
├── audio-selector.js     # Audio device operations
├── settings.html         # Settings dialog UI
├── settings-preload.js   # Settings window preload API
├── tray-popup.js         # Small popup window controller
├── popup.html            # Popup UI
└── popup-preload.js      # Popup preload API
```

### Technical Specifications

- Electron + Electron Forge
- Windows Audio API operations using PowerShell + C# (dynamic compilation)
- Settings persistence using JSON files (`device-settings.json`)

## License

MIT License

## Author

Omoshiraise LLC (https://www.omoshiraise.com)
