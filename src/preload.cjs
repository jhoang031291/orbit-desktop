const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('orbit', {
  command: (name, data) => ipcRenderer.invoke('command', name, data),
  onState: listener => ipcRenderer.on('state', (_event, state) => listener(state)),
  onSaveError: listener => ipcRenderer.on('save-error', (_event, message) => listener(message))
});
