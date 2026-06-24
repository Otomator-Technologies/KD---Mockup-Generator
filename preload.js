const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectImages:           ()      => ipcRenderer.invoke('select-images'),
  selectDestination:      ()      => ipcRenderer.invoke('select-destination'),
  generateMockups:        (opts)  => ipcRenderer.invoke('generate-mockups', opts),
  getApiKey:              ()      => ipcRenderer.invoke('get-api-key'),
  saveApiKey:             (key)   => ipcRenderer.invoke('save-api-key', key),
  getScaleMode:           ()      => ipcRenderer.invoke('get-scale-mode'),
  saveScaleMode:          (mode)  => ipcRenderer.invoke('save-scale-mode', mode),
  onProgressUpdate:       (cb)    => ipcRenderer.on('progress-update', (_, d) => cb(d)),
  onLogEntry:             (cb)    => ipcRenderer.on('log-entry',       (_, d) => cb(d)),
  removeProgressListeners: ()     => ipcRenderer.removeAllListeners('progress-update')
});
