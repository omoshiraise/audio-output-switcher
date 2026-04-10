# AudioSelector — Windows Playback Device Management Module for Electron

[English](README_audio-selector.en.md) | [日本語](README_audio-selector.md)

## Files

| File | Role |
|---|---|
| `main/audio-selector.js` | `AudioSelector` class **(Main process only)** |
| `main/main.js` | Main entry for the tray app (Example) |

---

## Setup

### 1. Install Dependencies

`AudioSelector` uses only Node.js standard modules (`child_process`, `fs`, `os`, `path`), so no additional npm packages are required.

### 2. Integration into main/main.js

To use it as a tray application:

```js
const { app, Tray, Menu } = require('electron');
const { AudioSelector } = require('./audio-selector');

const selector = new AudioSelector();

app.whenReady().then(async () => {
  const tray = new Tray(icon);
  const { devices, defaultDeviceId } = await selector.EnumAudioDevice();
  // Build and display menu
});
```

---

## API

### `EnumAudioDevice() → Promise`

Enumerates active playback devices.

**Return Value:**
```js
{
  devices: [
    { id: "{0.0.0.00000000}.{...GUID...}", name: "Speakers (Realtek)", isDefault: true },
    { id: "{0.0.0.00000000}.{...GUID...}", name: "Headphones (USB)",   isDefault: false },
  ],
  defaultDeviceId: "{0.0.0.00000000}.{...GUID...}"
}
```

### `SelectAudioDevice(deviceId) → Promise`

Switches the Windows default playback device to the specified device.

**Arguments:**
- `deviceId` — The `id` string obtained from `EnumAudioDevice`.

**Return Value:**
```js
{ success: true, deviceId: "{0.0.0.00000000}.{...GUID...}" }
```

---

## Scope in This Repository

`AudioSelector` is responsible only for device enumeration/switching. The following features are implemented at the app layer (`main/main.js` and UI files):

- Tray menu rendering
- Settings window (`renderer/settings/settings.html`) load/save flow
- Per-device hotkey assignment and conflict detection
- Startup registration toggle
- Small popup on successful switch
- Persistent settings in `device-settings.json`

So if you want to change hotkeys or popup behavior, edit `main/main.js` / `main/tray-popup.js` / `renderer/settings/settings.html` rather than `main/audio-selector.js`.

---

## Requirements

- **OS**: Windows 10 / 11
- **PowerShell**: 5.1 or higher (Pre-installed)
- **Electron**: Must be used in the Main process (Cannot be used in Renderer directly)

---

## Notes

- It operates without external tools by dynamically compiling C# code via PowerShell to directly call the Windows Core Audio COM API.
- Device IDs are fixed GUIDs that remain consistent across Windows sessions.
- If PowerShell execution policy is restricted in your environment, set it to `Bypass` or use signed scripts.