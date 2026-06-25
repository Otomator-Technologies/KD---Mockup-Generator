const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // File dialogs
  selectImages:            ()      => ipcRenderer.invoke('select-images'),
  selectSingleImage:       ()      => ipcRenderer.invoke('select-single-image'),
  selectDestination:       ()      => ipcRenderer.invoke('select-destination'),

  // Google AI flow
  generateMockups:         (opts)  => ipcRenderer.invoke('generate-mockups', opts),
  getApiKey:               ()      => ipcRenderer.invoke('get-api-key'),
  saveApiKey:              (key)   => ipcRenderer.invoke('save-api-key', key),
  getScaleMode:            ()      => ipcRenderer.invoke('get-scale-mode'),
  saveScaleMode:           (mode)  => ipcRenderer.invoke('save-scale-mode', mode),

  // Seamless Pattern Generator flow
  generateSeamlessPatterns:       (opts) => ipcRenderer.invoke('generate-seamless-patterns', opts),
  generateSeamlessPatternSingle:  (opts) => ipcRenderer.invoke('generate-seamless-pattern-single', opts),
  onSpImageStatus: (cb) => ipcRenderer.on('sp-image-status', (_, d) => cb(d)),

  // KD Mockup Generator flow
  generateMockupsKd:       (opts)  => ipcRenderer.invoke('generate-mockups-kd', opts),
  getKdConfig:             ()      => ipcRenderer.invoke('get-kd-config'),
  saveKdConfig:            (cfg)   => ipcRenderer.invoke('save-kd-config', cfg),
  getKdBasePairs:          ()      => ipcRenderer.invoke('get-kd-base-pairs'),
  saveKdBasePairs:         (pairs) => ipcRenderer.invoke('save-kd-base-pairs', pairs),

  // Crop Pattern
  readFileAsDataUrl:   (filePath) => ipcRenderer.invoke('read-file-as-data-url', filePath),
  saveCroppedImage:    (opts)     => ipcRenderer.invoke('save-cropped-image', opts),

  // Events
  onProgressUpdate:        (cb)    => ipcRenderer.on('progress-update', (_, d) => cb(d)),
  onLogEntry:              (cb)    => ipcRenderer.on('log-entry',        (_, d) => cb(d)),
  removeProgressListeners: ()      => ipcRenderer.removeAllListeners('progress-update')
});
