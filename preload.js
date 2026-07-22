// Safe bridge between the sandboxed renderer (the UI) and the main process.
// The renderer never gets direct Node/fs access — only these whitelisted calls.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('isha', {
  // window controls
  winMinimize: () => ipcRenderer.invoke('win:minimize'),
  winMaximizeToggle: () => ipcRenderer.invoke('win:maximizeToggle'),
  winClose: () => ipcRenderer.invoke('win:close'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  onWinState: (cb) => ipcRenderer.on('win:state', (_e, state) => cb(state)),

  // file system
  openFolderDialog: () => ipcRenderer.invoke('fs:openFolderDialog'),
  openFileDialog: () => ipcRenderer.invoke('fs:openFileDialog'),
  listDir: (dirPath) => ipcRenderer.invoke('fs:listDir', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  createFile: (filePath) => ipcRenderer.invoke('fs:createFile', filePath),
  createFolder: (folderPath) => ipcRenderer.invoke('fs:createFolder', folderPath),
  rename: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  deletePath: (targetPath) => ipcRenderer.invoke('fs:delete', targetPath),
  revealInOS: (targetPath) => ipcRenderer.invoke('fs:revealInOS', targetPath),
  homeDir: () => ipcRenderer.invoke('fs:homeDir'),

  // terminal
  termCreate: (id, cwd) => ipcRenderer.invoke('term:create', { id, cwd }),
  termWrite: (id, data) => ipcRenderer.invoke('term:write', { id, data }),
  termResize: (id, cols, rows) => ipcRenderer.invoke('term:resize', { id, cols, rows }),
  termKill: (id) => ipcRenderer.invoke('term:kill', { id }),
  onTermData: (cb) => ipcRenderer.on('term:data', (_e, payload) => cb(payload)),
  onTermExit: (cb) => ipcRenderer.on('term:exit', (_e, payload) => cb(payload)),

  // AI chat agent (local model server only, e.g. Ollama)
  aiListModels: (endpoint) => ipcRenderer.invoke('ai:listModels', endpoint),
  aiChat: (requestId, endpoint, model, messages) =>
    ipcRenderer.invoke('ai:chat', { requestId, endpoint, model, messages }),
  onAiChunk: (cb) => ipcRenderer.on('ai:chunk', (_e, payload) => cb(payload)),
  onAiDone: (cb) => ipcRenderer.on('ai:done', (_e, payload) => cb(payload)),
  onAiError: (cb) => ipcRenderer.on('ai:error', (_e, payload) => cb(payload)),

  // git (best-effort, optional)
  gitStatus: (repoRoot) => ipcRenderer.invoke('git:status', repoRoot),

  // extensions
  extList: () => ipcRenderer.invoke('ext:list'),
  extSetEnabled: (id, enabled) => ipcRenderer.invoke('ext:setEnabled', id, enabled),

  // misc
  pathSep: () => (process.platform === 'win32' ? '\\' : '/'),
  platform: process.platform
});
