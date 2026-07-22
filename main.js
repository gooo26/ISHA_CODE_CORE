// ISHA Code Core — Electron main process
// Handles: window lifecycle, file-system access, an embedded terminal (node-pty),
// a proxy to a LOCAL AI model server (Ollama-compatible, no cloud API keys ever),
// and a tiny local "extension" registry.

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');

let mainWindow;
let ptyProcesses = new Map(); // id -> pty process
let ptyModule = null;

function getPty() {
  if (ptyModule) return ptyModule;
  try {
    ptyModule = require('node-pty');
  } catch (err) {
    ptyModule = null;
    console.error('node-pty failed to load. The terminal panel needs it to be built for your platform.', err.message);
  }
  return ptyModule;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b0d14',
    frame: false, // we draw our own titlebar for a custom look
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    },
    icon: path.join(__dirname, 'src', 'assets', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('maximize', () => mainWindow.webContents.send('win:state', 'maximized'));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('win:state', 'normal'));

  mainWindow.on('closed', () => {
    for (const proc of ptyProcesses.values()) {
      try { proc.kill(); } catch (_) {}
    }
    ptyProcesses.clear();
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

/* ---------------------------------------------------------------------- */
/*  Window controls                                                       */
/* ---------------------------------------------------------------------- */

ipcMain.handle('win:minimize', () => mainWindow?.minimize());
ipcMain.handle('win:maximizeToggle', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('win:close', () => mainWindow?.close());

ipcMain.handle('app:openExternal', (_evt, url) => {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
});

/* ---------------------------------------------------------------------- */
/*  File system access                                                    */
/* ---------------------------------------------------------------------- */

ipcMain.handle('fs:openFolderDialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('fs:openFileDialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'] });
  if (result.canceled) return [];
  return result.filePaths;
});

// Lazily list one directory level. The renderer expands folders on demand,
// which keeps huge projects fast to browse.
ipcMain.handle('fs:listDir', async (_evt, dirPath) => {
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  const items = entries
    .filter(e => !shouldIgnore(e.name))
    .map(e => ({
      name: e.name,
      path: path.join(dirPath, e.name),
      isDir: e.isDirectory(),
      isSymlink: e.isSymbolicLink()
    }));
  items.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
  return items;
});

function shouldIgnore(name) {
  return ['.git', 'node_modules', '.DS_Store'].includes(name);
}

ipcMain.handle('fs:readFile', async (_evt, filePath) => {
  try {
    const stat = await fsp.stat(filePath);
    if (stat.size > 5 * 1024 * 1024) {
      return { ok: false, error: 'File is larger than 5MB — opening it could freeze the editor.' };
    }
    const content = await fsp.readFile(filePath, 'utf8');
    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('fs:writeFile', async (_evt, filePath, content) => {
  try {
    await fsp.writeFile(filePath, content, 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('fs:createFile', async (_evt, filePath) => {
  try {
    await fsp.writeFile(filePath, '', { flag: 'wx' });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('fs:createFolder', async (_evt, folderPath) => {
  try {
    await fsp.mkdir(folderPath, { recursive: false });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('fs:rename', async (_evt, oldPath, newPath) => {
  try {
    await fsp.rename(oldPath, newPath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('fs:delete', async (_evt, targetPath) => {
  try {
    await fsp.rm(targetPath, { recursive: true, force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('fs:revealInOS', async (_evt, targetPath) => {
  shell.showItemInFolder(targetPath);
});

ipcMain.handle('fs:homeDir', () => os.homedir());

/* ---------------------------------------------------------------------- */
/*  Terminal (real shell, spawned locally via node-pty)                   */
/* ---------------------------------------------------------------------- */

ipcMain.handle('term:create', (evt, { id, cwd }) => {
  const pty = getPty();
  if (!pty) {
    evt.sender.send('term:data', { id, data: '\r\n[ISHA] node-pty is not installed/built for this platform.\r\nRun: npm install  (then, if needed) npx electron-rebuild\r\n' });
    return { ok: false };
  }
  const shellPath = process.platform === 'win32'
    ? 'powershell.exe'
    : (process.env.SHELL || '/bin/bash');

  const proc = pty.spawn(shellPath, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: cwd || os.homedir(),
    env: process.env
  });

  proc.onData(data => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('term:data', { id, data });
    }
  });
  proc.onExit(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('term:exit', { id });
    }
    ptyProcesses.delete(id);
  });

  ptyProcesses.set(id, proc);
  return { ok: true };
});

ipcMain.handle('term:write', (_evt, { id, data }) => {
  const proc = ptyProcesses.get(id);
  if (proc) proc.write(data);
});

ipcMain.handle('term:resize', (_evt, { id, cols, rows }) => {
  const proc = ptyProcesses.get(id);
  if (proc) {
    try { proc.resize(cols, rows); } catch (_) {}
  }
});

ipcMain.handle('term:kill', (_evt, { id }) => {
  const proc = ptyProcesses.get(id);
  if (proc) {
    try { proc.kill(); } catch (_) {}
    ptyProcesses.delete(id);
  }
});

/* ---------------------------------------------------------------------- */
/*  Git status (best-effort, used by the optional "Commit Lens" extension) */
/* ---------------------------------------------------------------------- */

const { execFile } = require('child_process');

function runGit(args, cwd) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(stdout);
    });
  });
}

ipcMain.handle('git:status', async (_evt, repoRoot) => {
  const branchOut = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot);
  if (branchOut === null) return { ok: false };
  const statusOut = await runGit(['status', '--porcelain'], repoRoot);
  const map = {};
  if (statusOut) {
    for (const line of statusOut.split('\n')) {
      if (!line.trim()) continue;
      const code = line.slice(0, 2);
      const rel = line.slice(3).trim();
      const full = path.join(repoRoot, rel);
      map[full] = code.includes('?') ? 'untracked' : 'modified';
    }
  }
  return { ok: true, branch: branchOut.trim(), files: map };
});

/* ---------------------------------------------------------------------- */
/*  AI Chat Agent — talks ONLY to a local model server (Ollama by         */
/*  default, on http://127.0.0.1:11434). No cloud API, no key, no cost.  */
/* ---------------------------------------------------------------------- */

const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';

ipcMain.handle('ai:listModels', async (_evt, endpoint) => {
  const base = endpoint || DEFAULT_ENDPOINT;
  try {
    const res = await fetch(`${base}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { ok: true, models: (data.models || []).map(m => m.name) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Streams a chat completion back to the renderer chunk by chunk over
// 'ai:chunk' / 'ai:done' / 'ai:error' events, keyed by requestId.
ipcMain.handle('ai:chat', async (evt, { requestId, endpoint, model, messages }) => {
  const base = endpoint || DEFAULT_ENDPOINT;
  const sender = evt.sender;
  try {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true })
    });

    if (!res.ok || !res.body) {
      throw new Error(`Local model server responded with HTTP ${res.status}. Is Ollama running?`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            sender.send('ai:chunk', { requestId, content: json.message.content });
          }
          if (json.done) {
            sender.send('ai:done', { requestId });
            return { ok: true };
          }
        } catch (_) { /* ignore partial JSON line */ }
      }
    }
    sender.send('ai:done', { requestId });
    return { ok: true };
  } catch (err) {
    sender.send('ai:error', { requestId, error: err.message });
    return { ok: false, error: err.message };
  }
});

/* ---------------------------------------------------------------------- */
/*  Extension "marketplace" — a small local, offline registry.            */
/*  Ships bundled with the app; enable-state is persisted to userData.    */
/* ---------------------------------------------------------------------- */

function stateFilePath() {
  return path.join(app.getPath('userData'), 'extensions-state.json');
}

ipcMain.handle('ext:list', async () => {
  const registryPath = path.join(__dirname, 'extensions', 'registry.json');
  const registry = JSON.parse(await fsp.readFile(registryPath, 'utf8'));
  let state = null;
  try {
    state = JSON.parse(await fsp.readFile(stateFilePath(), 'utf8'));
  } catch (_) { /* first run, no state yet */ }
  if (state === null) {
    state = { 'aurora-glow-theme': true }; // sensible default, matches the app's default look
    await fsp.writeFile(stateFilePath(), JSON.stringify(state, null, 2));
  }
  return registry.map(ext => ({ ...ext, enabled: !!state[ext.id] }));
});

ipcMain.handle('ext:setEnabled', async (_evt, id, enabled) => {
  let state = {};
  try {
    state = JSON.parse(await fsp.readFile(stateFilePath(), 'utf8'));
  } catch (_) {}
  state[id] = enabled;
  await fsp.writeFile(stateFilePath(), JSON.stringify(state, null, 2));
  return { ok: true };
});
