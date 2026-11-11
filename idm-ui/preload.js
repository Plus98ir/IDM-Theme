const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDownloads: () => ipcRenderer.invoke('idm:get-downloads'),
  getDiskSpace: (drive = 'C:') => ipcRenderer.invoke('idm:disk-space', drive),
  runSpeedTest: () => ipcRenderer.invoke('idm:speed-test'),
  windowControl: (action) => ipcRenderer.send('win:control', action),
  addUrl: (url) => ipcRenderer.invoke('idm:add-url', url),
  openFile: (localFileName) => ipcRenderer.invoke('idm:open-file', localFileName),
  showInFolder: (localFileName) => ipcRenderer.invoke('idm:show-in-folder', localFileName),
  idmCommand: (cmd, payload) => ipcRenderer.invoke('idm:command', cmd, payload),
  onWindowStateChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('win:state', handler);
    return () => ipcRenderer.removeListener('win:state', handler);
  },
});
