const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  onState: (callback) => {
    if (typeof callback !== 'function') {
      throw new TypeError('onState requires a callback');
    }

    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state', listener);
    return () => ipcRenderer.removeListener('state', listener);
  },
  setMode: (mode) => ipcRenderer.invoke('set-mode', mode),
  clearConversation: () => ipcRenderer.invoke('clear-conversation'),
  toggleMute: () => ipcRenderer.invoke('toggle-mute'),
  copyLast: () => ipcRenderer.invoke('copy-last'),
  retryTurn: () => ipcRenderer.invoke('retry-turn'),
  hide: () => ipcRenderer.invoke('hide-overlay'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  getSettings: () => ipcRenderer.invoke('settings-get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings-save', settings),
  getDevices: () => ipcRenderer.invoke('sidecar-devices'),
});
