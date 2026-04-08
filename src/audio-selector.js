'use strict';

/**
 * AudioSelector
 *   EnumAudioDevice()      再生デバイス一覧と既定デバイスを返す
 *   SelectAudioDevice(id)  指定IDのデバイスを既定再生デバイスに切り替える
 *
 * 動作要件: Windows 10/11, PowerShell 5.1+
 * SelectAudioDevice には AudioDeviceCmdlets が必要:
 *   Install-Module -Name AudioDeviceCmdlets -Scope CurrentUser -Force
 *
 * ---
 * COM インターフェース定義 ([ComImport] / [InterfaceType]) を使うと
 * PowerShell の Add-Type 環境では System.__ComObject のキャストが失敗する。
 * 代わりに CoCreateInstance で得た IntPtr の vtable を
 * Marshal.GetDelegateForFunctionPointer でデリゲートに変換して直接呼び出す。
 */

const { execFile } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

// ─── PowerShell ヘルパー (UTF-8 BOM 付き一時ファイル経由) ──────────────────

function runPsFile(body) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `audsel_${process.pid}_${Date.now()}.ps1`);
    try { fs.writeFileSync(tmp, '\uFEFF' + body, 'utf8'); }
    catch (e) { return reject(new Error('temp write: ' + e.message)); }

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmp],
      { encoding: 'utf8', windowsHide: true },
      (err, stdout, stderr) => {
        try { fs.unlinkSync(tmp); } catch (_) {}
        if (err) return reject(new Error(stderr.trim() || err.message));
        resolve(stdout.trim());
      }
    );
  });
}

async function checkExecutionPolicy() {
  const checkScript = 'Get-ExecutionPolicy';
  try {
    const policy = await runPsFile(checkScript);
    if (policy === 'Restricted') {
      throw new Error('お使いのPCのPowerShellの実行ポリシーがRestrictedに設定されています。管理者権限で以下のコマンドを実行してください：Set-ExecutionPolicy RemoteSigned -Scope CurrentUser');
    }
    if (policy === 'AllSigned') {
      throw new Error('お使いのPCのPowerShellの実行ポリシーがAllSignedに設定されています。スクリプトにデジタル署名するか、ポリシーを変更してください。');
    }
  } catch (err) {
    if (err.message.includes('Get-ExecutionPolicy')) {
      throw new Error('お使いのPCのPowerShellの実行ポリシーを確認できませんでした。PowerShellが正しくインストールされているか確認してください。');
    }
    throw err;
  }
}

// ─── C# ソース: vtable 経由の COM 呼び出し ─────────────────────────────────
//
// IMMDeviceEnumerator vtable レイアウト (IUnknown の後):
//   [0] QueryInterface  [1] AddRef  [2] Release   ← IUnknown
//   [3] NotImpl1 (EnumAudioEndpoints... ではなく Reserved)
//   実際のレイアウト (mmdeviceapi.h より):
//   [3] EnumAudioEndpoints
//   [4] GetDefaultAudioEndpoint
//   [5] GetDevice
//   [6] RegisterEndpointNotificationCallback
//   [7] UnregisterEndpointNotificationCallback
//
// IMMDeviceCollection vtable:
//   [3] GetCount  [4] Item
//
// IMMDevice vtable:
//   [3] Activate  [4] OpenPropertyStore  [5] GetId  [6] GetState
//
// IPropertyStore vtable:
//   [3] GetCount  [4] GetAt  [5] GetValue  [6] SetValue  [7] Commit

const CS = `
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Text;

public static class MMAudio {
    // ── P/Invoke ──────────────────────────────────────────────────────────
    [DllImport("ole32.dll")] static extern int CoCreateInstance(
        ref Guid rclsid, IntPtr pUnkOuter, uint dwClsContext,
        ref Guid riid, out IntPtr ppv);
    [DllImport("ole32.dll")] static extern void CoTaskMemFree(IntPtr ptr);

    // ── vtable ヘルパー ────────────────────────────────────────────────────
    static IntPtr Vtbl(IntPtr obj, int slot) {
        IntPtr vtbl = Marshal.ReadIntPtr(obj);
        return Marshal.ReadIntPtr(vtbl, slot * IntPtr.Size);
    }

    // ── デリゲート型 ───────────────────────────────────────────────────────
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int DEnumEndpoints(IntPtr self, int dataFlow, int stateMask, out IntPtr ppCol);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int DGetDefault(IntPtr self, int dataFlow, int role, out IntPtr ppDev);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int DColCount(IntPtr self, out uint pCount);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int DColItem(IntPtr self, uint n, out IntPtr ppDev);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int DGetId(IntPtr self, out IntPtr ppstrId);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int DOpenStore(IntPtr self, uint access, out IntPtr ppStore);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int DGetValue(IntPtr self, ref PROPERTYKEY key, out PROPVARIANT pv);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    delegate int DRelease(IntPtr self);

    // ── 構造体 ─────────────────────────────────────────────────────────────
    [StructLayout(LayoutKind.Sequential)]
    public struct PROPERTYKEY { public Guid fmtid; public uint pid; }

    [StructLayout(LayoutKind.Explicit, Size=16)]
    public struct PROPVARIANT {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public IntPtr ptr;
    }

    // ── 定数 ──────────────────────────────────────────────────────────────
    static readonly Guid CLSID_MMDeviceEnumerator =
        new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
    static readonly Guid IID_IMMDeviceEnumerator =
        new Guid("A95664D2-9614-4F35-A746-DE8DB63617E6");
    public static readonly PROPERTYKEY PKEY_FriendlyName = new PROPERTYKEY {
        fmtid = new Guid("{A45C254E-DF1C-4EFD-8020-67D146A850E0}"), pid = 14
    };

    // ── Release ヘルパー ──────────────────────────────────────────────────
    static void Release(IntPtr p) {
        if (p == IntPtr.Zero) return;
        var fn = (DRelease)Marshal.GetDelegateForFunctionPointer(Vtbl(p, 2), typeof(DRelease));
        fn(p);
    }

    // ── メイン API ────────────────────────────────────────────────────────
    public static List<string[]> GetDevices() {
        var list = new List<string[]>();

        // CoCreateInstance
        Guid clsid = CLSID_MMDeviceEnumerator;
        Guid iid   = IID_IMMDeviceEnumerator;
        IntPtr pEnum;
        int hr = CoCreateInstance(ref clsid, IntPtr.Zero, 1u, ref iid, out pEnum);
        if (hr != 0 || pEnum == IntPtr.Zero)
            throw new Exception("CoCreateInstance hr=0x" + hr.ToString("X8"));

        try {
            // GetDefaultAudioEndpoint (vtable slot 4)
            string defId = null;
            IntPtr pDefDev = IntPtr.Zero;
            var fnGetDef = (DGetDefault)Marshal.GetDelegateForFunctionPointer(
                Vtbl(pEnum, 4), typeof(DGetDefault));
            if (fnGetDef(pEnum, 0, 0, out pDefDev) == 0 && pDefDev != IntPtr.Zero) {
                IntPtr idPtr;
                var fnId = (DGetId)Marshal.GetDelegateForFunctionPointer(
                    Vtbl(pDefDev, 5), typeof(DGetId));
                if (fnId(pDefDev, out idPtr) == 0 && idPtr != IntPtr.Zero) {
                    defId = Marshal.PtrToStringUni(idPtr);
                    CoTaskMemFree(idPtr);
                }
                Release(pDefDev);
            }

            // EnumAudioEndpoints (vtable slot 3)
            IntPtr pCol;
            var fnEnum = (DEnumEndpoints)Marshal.GetDelegateForFunctionPointer(
                Vtbl(pEnum, 3), typeof(DEnumEndpoints));
            if (fnEnum(pEnum, 0, 1, out pCol) != 0 || pCol == IntPtr.Zero) return list;

            try {
                uint cnt = 0;
                var fnCount = (DColCount)Marshal.GetDelegateForFunctionPointer(
                    Vtbl(pCol, 3), typeof(DColCount));
                fnCount(pCol, out cnt);

                var fnItem = (DColItem)Marshal.GetDelegateForFunctionPointer(
                    Vtbl(pCol, 4), typeof(DColItem));

                for (uint i = 0; i < cnt; i++) {
                    IntPtr pDev;
                    if (fnItem(pCol, i, out pDev) != 0 || pDev == IntPtr.Zero) continue;
                    try {
                        // GetId (slot 5)
                        string id = null;
                        IntPtr idPtr;
                        var fnId = (DGetId)Marshal.GetDelegateForFunctionPointer(
                            Vtbl(pDev, 5), typeof(DGetId));
                        if (fnId(pDev, out idPtr) == 0 && idPtr != IntPtr.Zero) {
                            id = Marshal.PtrToStringUni(idPtr);
                            CoTaskMemFree(idPtr);
                        }
                        if (id == null) continue;

                        // OpenPropertyStore (slot 4) → GetValue
                        string name = "";
                        IntPtr pStore;
                        var fnStore = (DOpenStore)Marshal.GetDelegateForFunctionPointer(
                            Vtbl(pDev, 4), typeof(DOpenStore));
                        if (fnStore(pDev, 0u, out pStore) == 0 && pStore != IntPtr.Zero) {
                            try {
                                PROPERTYKEY key = PKEY_FriendlyName;
                                PROPVARIANT pv  = new PROPVARIANT();
                                var fnGV = (DGetValue)Marshal.GetDelegateForFunctionPointer(
                                    Vtbl(pStore, 5), typeof(DGetValue));
                                if (fnGV(pStore, ref key, out pv) == 0 && pv.vt == 31)
                                    name = Marshal.PtrToStringUni(pv.ptr) ?? "";
                            } finally { Release(pStore); }
                        }

                        list.Add(new string[]{ id, name, id == defId ? "1" : "0" });
                    } finally { Release(pDev); }
                }
            } finally { Release(pCol); }
        } finally { Release(pEnum); }

        return list;
    }

    // ── SetDefaultDevice ──────────────────────────────────────────────────
    // IPolicyConfig (undocumented) vtable:
    //   [0-2] IUnknown
    //   [3]  GetMixFormat          [4]  GetDeviceFormat
    //   [5]  ResetDeviceFormat     [6]  SetDeviceFormat
    //   [7]  GetProcessingPeriod   [8]  SetProcessingPeriod
    //   [9]  GetShareMode          [10] SetShareMode
    //   [11] GetPropertyValue      [12] SetPropertyValue
    //   [13] SetDefaultEndpoint    <-- これを使う
    //   [14] SetEndpointVisibility
    static readonly Guid CLSID_PolicyConfig =
        new Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9");
    static readonly Guid IID_IPolicyConfig =
        new Guid("F8679F50-850A-41CF-9C72-430F290290C8");

    [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet = CharSet.Unicode)]
    delegate int DSetDefaultEndpoint(IntPtr self,
        [MarshalAs(UnmanagedType.LPWStr)] string deviceId, int role);

    public static int SetDefaultDevice(string deviceId) {
        Guid clsid = CLSID_PolicyConfig;
        Guid iid   = IID_IPolicyConfig;
        IntPtr pPolicy;
        int hr = CoCreateInstance(ref clsid, IntPtr.Zero, 1u, ref iid, out pPolicy);
        if (hr != 0 || pPolicy == IntPtr.Zero) return hr;
        try {
            var fn = (DSetDefaultEndpoint)Marshal.GetDelegateForFunctionPointer(
                Vtbl(pPolicy, 13), typeof(DSetDefaultEndpoint));
            // role: 0=eConsole, 1=eMultimedia, 2=eCommunications
            hr = fn(pPolicy, deviceId, 0);
            if (hr == 0) fn(pPolicy, deviceId, 1);
            if (hr == 0) fn(pPolicy, deviceId, 2);
            return hr;
        } finally { Release(pPolicy); }
    }
}
`;

// ─── PowerShell スクリプト ──────────────────────────────────────────────────

const ENUM_SCRIPT = [
  '$ErrorActionPreference = "Stop"',
  '$OutputEncoding = [System.Text.Encoding]::UTF8',
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  '',
  'if (-not ([System.Management.Automation.PSTypeName]"MMAudio").Type) {',
  '    Add-Type -Language CSharp -TypeDefinition @"',
  CS.trim(),
  '"@',
  '}',
  '',
  '$rows = [MMAudio]::GetDevices()',
  '$out = @(foreach ($r in $rows) {',
  '    [PSCustomObject]@{ id=$r[0]; name=$r[1]; isDefault=($r[2] -eq "1") }',
  '})',
  'if ($out.Count -eq 0) { Write-Output "[]"; exit 0 }',
  'Write-Output ($out | ConvertTo-Json -Compress)',
].join('\r\n');

// ─── AudioSelector クラス ───────────────────────────────────────────────────

class AudioSelector {
  async EnumAudioDevice() {
    await checkExecutionPolicy();
    let raw;
    try { raw = await runPsFile(ENUM_SCRIPT); }
    catch (err) { throw new Error('EnumAudioDevice failed: ' + err.message); }

    const jsonLine = raw.split(/\r?\n/).map(l => l.trim())
      .filter(l => l.startsWith('[') || l.startsWith('{')).pop();

    if (!jsonLine)
      throw new Error('EnumAudioDevice: no JSON in output.\n---\n' + raw);

    let parsed = JSON.parse(jsonLine);
    if (!Array.isArray(parsed)) parsed = [parsed];

    const devices = parsed.map(d => ({
      id: d.id, name: d.name, isDefault: !!d.isDefault,
    }));
    const def = devices.find(d => d.isDefault) || null;
    return { devices, defaultDeviceId: def ? def.id : null };
  }

  async SelectAudioDevice(deviceId) {
    await checkExecutionPolicy();
    if (!deviceId || typeof deviceId !== 'string')
      throw new Error('SelectAudioDevice: deviceId must be a non-empty string');

    // C# の SetDefaultDevice を使うので AudioDeviceCmdlets は不要
    // EnumAudioDevice と同じ Add-Type + vtable 方式で即座に切り替える
    const safeId = deviceId.replace(/"/g, '\\"');
    const script = [
      '$ErrorActionPreference = "Stop"',
      '$OutputEncoding = [System.Text.Encoding]::UTF8',
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      '',
      'if (-not ([System.Management.Automation.PSTypeName]"MMAudio").Type) {',
      '    Add-Type -Language CSharp -TypeDefinition @"',
      CS.trim(),
      '"@',
      '}',
      '',
      `$hr = [MMAudio]::SetDefaultDevice("${safeId}")`,
      'if ($hr -ne 0) { Write-Error ("SetDefaultDevice failed hr=0x" + $hr.ToString("X8")); exit 1 }',
      'Write-Output "ok"',
    ].join('\r\n');

    let out;
    try { out = await runPsFile(script); }
    catch (err) { throw new Error('SelectAudioDevice failed: ' + err.message); }
    return { success: out.trim() === 'ok', deviceId };
  }
}

module.exports = { AudioSelector };
