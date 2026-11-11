const electron = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');

if (typeof electron === 'string' || !electron.app) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const exePath = typeof electron === 'string' ? electron : process.execPath;
  const child = spawn(exePath, process.argv.slice(1), { stdio: 'inherit', env });
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  const { app, BrowserWindow, ipcMain, shell, dialog } = electron;
  runMainProcess({ app, BrowserWindow, ipcMain, shell, dialog });
}

function runMainProcess({ app, BrowserWindow, ipcMain, shell, dialog }) {

const IDM_PATHS = [
  'C:\\Program Files (x86)\\Internet Download Manager\\IDMan.exe',
  'C:\\Program Files\\Internet Download Manager\\IDMan.exe',
];

const REG_BASE_PS = 'HKCU:\\Software\\DownloadManager';

const CP1252_MAP = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

const utf8FatalDecoder = new TextDecoder('utf-8', { fatal: true });

// ── Helpers ──────────────────────────────────────────────────────────────────

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: 'utf8', maxBuffer: 25 * 1024 * 1024, ...options }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        return reject(err);
      }
      resolve(stdout);
    });
  });
}

function findIdmExecutable() {
  for (const candidate of IDM_PATHS) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function spawnDetached(exePath, args = []) {
  return new Promise((resolve) => {
    try {
      const child = spawn(exePath, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      let settled = false;
      child.once('error', (err) => {
        if (!settled) {
          settled = true;
          resolve({ ok: false, message: err.message });
        }
      });
      child.once('spawn', () => {
        child.unref();
        if (!settled) {
          settled = true;
          resolve({ ok: true });
        }
      });
    } catch (err) {
      resolve({ ok: false, message: err.message });
    }
  });
}

function isIdmRunning() {
  return execFileAsync('tasklist.exe', ['/FI', 'IMAGENAME eq IDMan.exe', '/NH'], { windowsHide: true })
    .then((out) => /IDMan\.exe/i.test(out))
    .catch(() => false);
}

/** Start IDM quietly in the tray (same switch IDM uses for its own autostart) so capture keeps working. */
async function ensureIdmInBackground() {
  if (await isIdmRunning()) return;
  await launchIDM(['/onboot']);
}

function launchIDM(args = []) {
  const idmExe = findIdmExecutable();
  if (!idmExe) {
    return Promise.resolve({ ok: false, message: 'IDMan.exe not found in Program Files' });
  }
  return spawnDetached(idmExe, args);
}

/**
 * Fix CP1252-interpreted UTF-8 mojibake (e.g. Persian/Arabic ID3 metadata stored by IDM).
 */
function fixMojibake(str) {
  if (!str) return '';
  const bytes = [];
  let hasHighByte = false;

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0xff) {
      if (code >= 0x80) hasHighByte = true;
      bytes.push(code);
    } else if (CP1252_MAP[code] !== undefined) {
      hasHighByte = true;
      bytes.push(CP1252_MAP[code]);
    } else {
      return str;
    }
  }

  if (!hasHighByte) return str;
  try {
    return utf8FatalDecoder.decode(Uint8Array.from(bytes));
  } catch {
    return str;
  }
}

function safeDecodeURIComponent(str) {
  if (!str) return '';
  const withSpaces = str.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(withSpaces);
  } catch {
    return withSpaces.replace(/%[0-9A-Fa-f]{2}/g, (seq) => {
      try {
        return decodeURIComponent(seq);
      } catch {
        return seq;
      }
    });
  }
}

function decodeEncLNFSW(base64Str) {
  if (!base64Str) return '';
  try {
    const buf = Buffer.from(base64Str, 'base64');
    let out = '';
    for (let i = 0; i + 1 < buf.length; i += 2) {
      const rawCode = buf.readUInt16LE(i);
      if (rawCode === 0) break;
      const code = rawCode ^ 0x0f;
      if (code === 0) break;
      out += String.fromCharCode(code);
    }
    const trimmed = out.replace(/[\x00-\x1f]+$/g, '').trim();
    return /^[A-Za-z]:\\/.test(trimmed) ? trimmed : '';
  } catch {
    return '';
  }
}

function extractCleanFileName(rawFileName, encPath, localFileName, id) {
  const decoded = safeDecodeURIComponent(rawFileName);
  const qIndex = decoded.indexOf('?');

  if (qIndex !== -1) {
    const query = decoded.slice(qIndex + 1);
    const dispMatch = query.match(/filename\*?=(?:UTF-8'')?["']?([^"';&\r\n]+)["']?/i);
    if (dispMatch && dispMatch[1]) {
      const fromParam = safeDecodeURIComponent(dispMatch[1]).trim();
      if (fromParam) return path.basename(fromParam);
    }
  }

  const basePart = (qIndex !== -1 ? decoded.slice(0, qIndex) : decoded).trim();
  const hasExtension = /\.[A-Za-z0-9]{1,10}$/.test(basePart);
  if (basePart && hasExtension) return basePart;

  if (encPath) {
    const encBase = path.basename(encPath);
    if (encBase) return encBase;
  }

  if (basePart) return basePart;
  if (localFileName) return path.basename(localFileName);
  return `download_${id}`;
}

function resolveBestLocalPaths(encPath, regLocalFileName, regLocalPath, status) {
  let localFileName = '';
  if (encPath && fs.existsSync(encPath)) {
    localFileName = encPath;
  } else if (regLocalFileName && fs.existsSync(regLocalFileName)) {
    localFileName = regLocalFileName;
  } else if (status === 3 && encPath) {
    localFileName = encPath;
  } else {
    localFileName = encPath || regLocalFileName || '';
  }

  const localPath = localFileName ? path.dirname(localFileName) : (regLocalPath || '');
  return { localFileName, localPath };
}

function buildDownloadEntry(item) {
  const id = String(item.id || '');
  const rawFileName = String(item.FileName || '');
  const encPath = decodeEncLNFSW(item.EncLNFSW);
  const status = Number.isFinite(Number(item.Status)) ? Number(item.Status) : 0;

  const { localFileName, localPath } = resolveBestLocalPaths(
    encPath,
    String(item.LocalFileName || ''),
    String(item.LocalPath || ''),
    status
  );

  const fileName = extractCleanFileName(rawFileName, encPath, localFileName, id);
  const url = String(item.Url0 || '').trim()
    || (item.Host && item.Path ? `https://${item.Host}${item.Path}${rawFileName}` : '');

  const rawDesc = item.WDescription || item.Description || item.lastResult || '';
  const description = fixMojibake(String(rawDesc)).replace(/^[\s,]+/, '').trim();

  return {
    id,
    fileName,
    rawFileName,
    localFileName,
    localPath,
    url,
    fileSize: Number(item.FileSize) || 0,
    downloaded: Number(item.Downloaded) || 0,
    status,
    categoryID: Number.isFinite(Number(item.categoryID)) ? Number(item.categoryID) : 0,
    dateAdded: String(item.dateAdded || ''),
    lastTryDate: String(item.lastTryDate || item.LastTryDate || item.dateAdded || ''),
    speed: Number(item.Speed) || 0,
    queueID: Number.isFinite(Number(item.queueID)) ? Number(item.queueID) : 0,
    description,
    _stTime: Number(item.st_time) || 0,
  };
}

// ── Core Service Functions ───────────────────────────────────────────────────

async function getDownloads() {
  const psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$base = '${REG_BASE_PS}'
if (-not (Test-Path $base)) { '[]'; exit 0 }
$items = Get-ChildItem -Path $base -ErrorAction SilentlyContinue |
  Where-Object { $_.PSChildName -match '^\\d+$' } |
  ForEach-Object {
    $p = Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue
    if ($null -eq $p) { return }
    [PSCustomObject]@{
      id            = [string]$_.PSChildName
      FileName      = [string]$p.FileName
      LocalFileName = [string]$p.LocalFileName
      LocalPath     = [string]$p.LocalPath
      Url0          = [string]$p.Url0
      Host          = [string]$p.Host
      Path          = [string]$p.Path
      FileSize      = if ($p.FileSize -is [byte[]] -and $p.FileSize.Length -ge 8) { [BitConverter]::ToInt64($p.FileSize, 0) } elseif ($p.FRFileSize -is [byte[]] -and $p.FRFileSize.Length -ge 8) { [BitConverter]::ToInt64($p.FRFileSize, 0) } else { 0 }
      Downloaded    = if ($p.Downloaded -is [byte[]] -and $p.Downloaded.Length -ge 8) { [BitConverter]::ToInt64($p.Downloaded, 0) } else { 0 }
      Status        = if ($null -ne $p.Status) { [int]$p.Status } else { 0 }
      categoryID    = if ($null -ne $p.categoryID) { [int]$p.categoryID } else { 0 }
      dateAdded     = [string]$p.dateAdded
      lastTryDate   = if ($p.lastTryDate) { [string]$p.lastTryDate } else { [string]$p.LastTryDate }
      Speed         = if ($null -ne $p.Speed) { [int64]$p.Speed } else { 0 }
      queueID       = if ($null -ne $p.queueID) { [int]$p.queueID } else { 0 }
      WDescription  = [string]$p.WDescription
      Description   = [string]$p.Description
      lastResult    = [string]$p.lastResult
      EncLNFSW      = if ($p.EncLNFSW -is [byte[]] -and $p.EncLNFSW.Length -ge 2) { [Convert]::ToBase64String($p.EncLNFSW) } else { '' }
      st_time       = if ($null -ne $p.st_time) { [int64]$p.st_time } else { 0 }
    }
  }
@($items) | ConvertTo-Json -Compress -Depth 3
`.trim();

  try {
    const stdout = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript]);
    const trimmed = stdout.trim();
    if (!trimmed) return [];
    const parsed = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : [parsed];

    return list
      .map(buildDownloadEntry)
      .sort((a, b) => (b._stTime - a._stTime) || (Number(b.id) - Number(a.id)))
      .map(({ _stTime, ...rest }) => rest);
  } catch (err) {
    console.error('[idm:get-downloads]', err.message);
    return [];
  }
}

async function getDiskSpace(driveInput = 'C:') {
  const match = String(driveInput || 'C').match(/[A-Za-z]/);
  const letter = (match ? match[0] : 'C').toUpperCase();
  const drive = `${letter}:`;

  try {
    const psCmd = `Get-PSDrive -Name '${letter}' -ErrorAction Stop | Select-Object Used,Free | ConvertTo-Json -Compress`;
    const stdout = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd]);
    const info = JSON.parse(stdout.trim() || '{}');
    const usedBytes = Number(info.Used) || 0;
    const freeBytes = Number(info.Free) || 0;
    const totalBytes = usedBytes + freeBytes;
    const toGB = (b) => Math.round((b / (1024 ** 3)) * 100) / 100;

    return {
      drive,
      freeGB: toGB(freeBytes),
      totalGB: toGB(totalBytes),
      usedPercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0,
    };
  } catch (err) {
    console.error('[idm:disk-space]', err.message);
    return { drive, freeGB: 0, totalGB: 0, usedPercent: 0 };
  }
}

async function runSpeedTest() {
  try {
    // Quick TLS warmup
    await fetch('https://speed.cloudflare.com/__down?bytes=10000', {
      signal: AbortSignal.timeout(2500),
    }).then((r) => r.arrayBuffer());

    const dlBytes = 500000;
    const dlStart = performance.now();
    const dlRes = await fetch(`https://speed.cloudflare.com/__down?bytes=${dlBytes}`, {
      signal: AbortSignal.timeout(4000),
    });
    const dlBuf = await dlRes.arrayBuffer();
    const dlSec = Math.max((performance.now() - dlStart) / 1000, 0.01);
    const downloadMbps = Math.round(((dlBuf.byteLength * 8) / (dlSec * 1e6)) * 100) / 100;

    const ulBytes = 250000;
    const ulPayload = Buffer.alloc(ulBytes);
    const ulStart = performance.now();
    await fetch('https://speed.cloudflare.com/__up', {
      method: 'POST',
      body: ulPayload,
      signal: AbortSignal.timeout(4000),
    });
    const ulSec = Math.max((performance.now() - ulStart) / 1000, 0.01);
    const uploadMbps = Math.round(((ulBytes * 8) / (ulSec * 1e6)) * 100) / 100;

    return { downloadMbps, uploadMbps };
  } catch {
    // Fallback: ping-based latency bandwidth estimate
    try {
      const out = await execFileAsync('ping', ['-n', '3', '8.8.8.8']);
      const m = out.match(/Average\s*=\s*(\d+)\s*ms/i);
      const avgMs = m ? Math.max(parseInt(m[1], 10), 1) : 100;
      const downloadMbps = Math.round(Math.min(1000 / avgMs, 100) * 100) / 100;
      const uploadMbps = Math.round(downloadMbps * 0.55 * 100) / 100;
      return { downloadMbps, uploadMbps };
    } catch {
      return { downloadMbps: 0, uploadMbps: 0 };
    }
  }
}

async function getDefaultDownloadsDir() {
  try {
    const psCmd = `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $r=Get-ItemProperty '${REG_BASE_PS}' -ErrorAction SilentlyContinue; if($r.LocalPathW){[System.Text.Encoding]::Unicode.GetString($r.LocalPathW).TrimEnd([char]0)}else{''}`;
    const dir = (await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd])).trim();
    if (dir && fs.existsSync(dir)) return dir;
  } catch {
    // fall through
  }
  return app.getPath('downloads');
}

async function deleteDownloadEntry(payload) {
  if (payload && typeof payload === 'object' && payload.confirmed === false) {
    return { ok: false, message: 'Deletion cancelled' };
  }

  const rawId = typeof payload === 'object' && payload !== null ? payload.id : payload;
  const id = String(rawId || '').trim();
  if (!/^\d+$/.test(id)) {
    return { ok: false, message: 'Invalid download ID' };
  }

  const explicitlyConfirmed = Boolean(payload && typeof payload === 'object' && payload.confirmed === true);
  if (!explicitlyConfirmed && mainWindow) {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Cancel', 'Delete'],
      defaultId: 0,
      cancelId: 0,
      title: 'Delete Download Entry',
      message: `Remove download #${id} from the IDM registry?`,
      detail: 'This removes the entry from IDM history. Files already saved on disk are kept.',
    });
    if (response !== 1) {
      return { ok: false, message: 'Deletion cancelled by user' };
    }
  }

  try {
    await execFileAsync('reg.exe', ['delete', `HKCU\\Software\\DownloadManager\\${id}`, '/f']);
    return { ok: true, message: `Deleted entry #${id}` };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

async function handleIdmCommand(cmd, payload) {
  switch (cmd) {
    case 'open-idm':
    case 'options':
    case 'queues':
    case 'schedule':
      return launchIDM([]);

    case 'start-queue':
    case 'resume':
      return launchIDM(['/s']);

    case 'redownload': {
      const url = String(typeof payload === 'string' ? payload : payload?.url || '').trim();
      if (!url) return { ok: false, message: 'No download URL available for this entry' };
      return launchIDM(['/d', url]);
    }

    case 'disk-cleaner':
      return spawnDetached('cleanmgr.exe', []);

    case 'open-downloads-folder': {
      const dir = await getDefaultDownloadsDir();
      const err = await shell.openPath(dir);
      return err ? { ok: false, message: err } : { ok: true };
    }

    case 'delete-download':
      return deleteDownloadEntry(payload);

    default:
      return { ok: false, message: `Unsupported command: ${cmd}` };
  }
}

// ── Window & IPC Setup ───────────────────────────────────────────────────────

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 920,
    minHeight: 580,
    frame: false,
    transparent: false,
    backgroundColor: '#16161D',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('maximize', () => mainWindow?.webContents.send('win:state', { maximized: true }));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('win:state', { maximized: false }));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function registerIPC() {
  ipcMain.handle('idm:get-downloads', () => getDownloads());
  ipcMain.handle('idm:disk-space', (_event, drive) => getDiskSpace(drive));
  ipcMain.handle('idm:speed-test', () => runSpeedTest());

  ipcMain.handle('idm:add-url', (_event, url) => {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl) return launchIDM([]);
    return launchIDM(['/d', cleanUrl]);
  });

  ipcMain.handle('idm:open-file', async (_event, localFileName) => {
    const target = String(localFileName || '').trim();
    if (!target || !fs.existsSync(target)) {
      return { ok: false, error: 'File not found on disk' };
    }
    const err = await shell.openPath(target);
    return err ? { ok: false, error: err } : { ok: true };
  });

  ipcMain.handle('idm:show-in-folder', async (_event, localFileName) => {
    const target = String(localFileName || '').trim();
    if (!target) return { ok: false };
    if (fs.existsSync(target)) {
      shell.showItemInFolder(target);
      return { ok: true };
    }
    const dir = path.dirname(target);
    if (dir && fs.existsSync(dir)) {
      const err = await shell.openPath(dir);
      return { ok: !err };
    }
    return { ok: false };
  });

  ipcMain.handle('idm:command', (_event, cmd, payload) => handleIdmCommand(cmd, payload));

  ipcMain.on('win:control', (_event, action) => {
    if (!mainWindow) return;
    if (action === 'minimize') mainWindow.minimize();
    else if (action === 'maximize') {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    } else if (action === 'close') mainWindow.close();
  });
}

// ── App Lifecycle ────────────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(() => {
  registerIPC();
  createWindow();
  ensureIdmInBackground();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
}
