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
  onPlayAudio: (callback) => {
    if (typeof callback !== 'function') {
      throw new TypeError('onPlayAudio requires a callback');
    }

    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('play-audio', listener);
    return () => ipcRenderer.removeListener('play-audio', listener);
  },
  onStopAudio: (callback) => {
    if (typeof callback !== 'function') {
      throw new TypeError('onStopAudio requires a callback');
    }

    const listener = () => callback();
    ipcRenderer.on('stop-audio', listener);
    return () => ipcRenderer.removeListener('stop-audio', listener);
  },
  audioEnded: (playbackId) => ipcRenderer.invoke('audio-ended', playbackId),
  setMode: (mode) => ipcRenderer.invoke('set-mode', mode),
  clearConversation: () => ipcRenderer.invoke('clear-conversation'),
  toggleMute: () => ipcRenderer.invoke('toggle-mute'),
  copyLast: () => ipcRenderer.invoke('copy-last'),
  retryTurn: () => ipcRenderer.invoke('retry-turn'),
  hide: () => ipcRenderer.invoke('hide-overlay'),
  quit: () => ipcRenderer.invoke('quit-app'),
  toggleListen: () => ipcRenderer.invoke('toggle-listen'),
  scanScreen: () => ipcRenderer.invoke('scan-screen'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  getSettings: () => ipcRenderer.invoke('settings-get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings-save', settings),
  pickKnowledgePdf: () => ipcRenderer.invoke('knowledge-pick'),
  clearKnowledgePdf: () => ipcRenderer.invoke('knowledge-clear'),
  getDevices: () => ipcRenderer.invoke('sidecar-devices'),
});
