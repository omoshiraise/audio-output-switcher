# AudioSelector — Electron 向け Windows 再生デバイス管理モジュール

## 構成ファイル

| ファイル | 役割 |
|---|---|
| `audio-selector.js` | `AudioSelector` クラス本体 **(メインプロセス専用)** |
| `main.js` | トレイアプリのメインエントリ (例) |

---

## セットアップ

### 1. 依存モジュールのインストール

`AudioSelector` 本体は Node.js 標準モジュール (`child_process`, `fs`, `os`, `path`) のみを使用するため
npm パッケージの追加は不要です。

### 2. main.js への組み込み

トレイアプリとして使用する場合：

```js
const { app, Tray, Menu } = require('electron');
const { AudioSelector } = require('./audio-selector');

const selector = new AudioSelector();

app.whenReady().then(async () => {
  const tray = new Tray(icon);
  const { devices, defaultDeviceId } = await selector.EnumAudioDevice();
  // メニュー構築と表示
});
```

---

## API

### `EnumAudioDevice() → Promise`

アクティブな再生デバイスを列挙します。

**戻り値:**
```js
{
  devices: [
    { id: "{0.0.0.00000000}.{...GUID...}", name: "スピーカー (Realtek)", isDefault: true },
    { id: "{0.0.0.00000000}.{...GUID...}", name: "ヘッドフォン (USB)",   isDefault: false },
  ],
  defaultDeviceId: "{0.0.0.00000000}.{...GUID...}"
}
```

### `SelectAudioDevice(deviceId) → Promise`

指定したデバイスを Windows の既定再生デバイスに切り替えます。

**引数:**
- `deviceId` — `EnumAudioDevice` で取得した `id` 文字列

**戻り値:**
```js
{ success: true, deviceId: "{0.0.0.00000000}.{...GUID...}" }
```

---

## このリポジトリでの実装範囲

`AudioSelector` は「デバイス列挙/切替」のみを担当します。以下は `main.js` 側のアプリ実装です。

- トレイメニュー表示
- 設定画面 (`settings.html`) の表示と保存
- デバイス別ホットキー割り当てと競合検知
- スタートアップ登録のON/OFF
- 切り替え時の小型ポップアップ表示
- デバイス設定 (`device-settings.json`) の永続化

つまり、ホットキーやUI通知を追加したい場合は `audio-selector.js` ではなく `main.js` / `tray-popup.js` / `settings.html` 側を編集します。

---

## メインプロセスから直接使う場合

```js
const { AudioSelector } = require('./audio-selector');
const selector = new AudioSelector();

const { devices } = await selector.EnumAudioDevice();
await selector.SelectAudioDevice(devices[0].id);
```

---

## 動作要件

- **OS**: Windows 10 / 11
- **PowerShell**: 5.1 以上 (OS 標準搭載)
- **Electron**: メインプロセスで使用 (レンダラー直接使用不可)

---

## 注意事項

- `EnumAudioDevice` と `SelectAudioDevice` は共に PowerShell で C# コードを動的コンパイルし、
  Windows Core Audio の COM API を直接呼び出すため、外部ツール不要で動作します。
- デバイス ID は Windows セッション間で変わらない固定 GUID 形式です。
- 企業環境で PowerShell の実行ポリシーが制限されている場合は、
  実行ポリシーを `Bypass` に設定するか、署名付きスクリプトを使用してください。
