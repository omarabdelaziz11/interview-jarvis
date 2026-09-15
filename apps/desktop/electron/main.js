const { app, BrowserWindow, clipboard, ipcMain, screen } = require('electron');
const path = require('path');

const MODES = new Set(['jarvis', 'interview']);
const state = {
  status: 'idle',
  mode: 'jarvis',
  messages: [],
  muted: false,
  error: null,
  heard: null,
};

let overlay = null;

function stateSnapshot() {
  return {
    ...state,
    messages: state.messages.map((message) => ({ ...message })),
  };
}

function sendState() {
  if (overlay && !overlay.isDestroyed()) {
    overlay.webContents.send('state', stateSnapshot());
  }
}

function isOverlaySender(event) {
  return overlay && !overlay.isDestroyed() && event.sender === overlay.webContents;
}

function registerIpcHandlers() {
  ipcMain.handle('set-mode', (event, mode) => {
    if (!isOverlaySender(event) || !MODES.has(mode)) {
      return stateSnapshot();
    }

    state.mode = mode;
    sendState();
    return stateSnapshot();
  });

  ipcMain.handle('clear-conversation', (event) => {
    if (!isOverlaySender(event)) return stateSnapshot();
    state.messages = [];
    state.error = null;
    state.heard = null;
    sendState();
    return stateSnapshot();
  });

  ipcMain.handle('toggle-mute', (event) => {
    if (!isOverlaySender(event)) return stateSnapshot();
    state.muted = !state.muted;
    sendState();
    return stateSnapshot();
  });

  ipcMain.handle('copy-last', (event) => {
    if (!isOverlaySender(event)) return false;
    const lastMessage = state.messages.at(-1);
    if (!lastMessage || typeof lastMessage.content !== 'string') return false;
    clipboard.writeText(lastMessage.content);
    return true;
  });

  ipcMain.handle('hide-overlay', (event) => {
    if (!isOverlaySender(event)) return false;
    overlay.hide();
    return true;
  });

  ipcMain.handle('open-settings', (event) => isOverlaySender(event) && false);
}

function createOverlay() {
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  overlay = new BrowserWindow({
    width: 380,
    height: 420,
    x: x + width - 400,
    y: y + height - 460,
    minWidth: 320,
    minHeight: 280,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setContentProtection(true);
  overlay.webContents.on('did-finish-load', () => {
    sendState();
    overlay.show();
  });
  overlay.on('closed', () => {
    overlay = null;
  });
  overlay.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createOverlay();
});

app.on('activate', () => {
  if (!overlay) createOverlay();
});

app.on('window-all-closed', () => {
  app.quit();
});
