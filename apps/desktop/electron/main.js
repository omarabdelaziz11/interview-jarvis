const { app, BrowserWindow, clipboard, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');

const sidecarClient = require('./sidecar-client');
const { SidecarManager } = require('./sidecar-manager');
const { getSettings, saveSettings } = require('./settings');
const { toPublicSettings } = require('./public-settings');
const conversation = require('./conversation');
const openaiClient = require('./openai-client');
const { systemFor, systemForScreenScan } = require('./prompts');
const { createListenHandlers } = require('./listen-pipeline');
const { OVERLAY_ERRORS, openAiErrorMessage } = require('./errors');
const tts = require('./tts');
const { capturePrimaryScreenPngDataUrl } = require('./screen-capture');

/** Text-only mode: TTS UI removed; keep false until speech is productized again. */
const TTS_ENABLED = false;

const MODES = new Set(['jarvis', 'interview']);
const state = {
  status: 'idle',
  muted: false,
  error: null,
  heard: null,
  lastTurnFailed: false,
};

let overlay = null;
let settingsWindow = null;
let quitting = false;
let unregisterHotkey = () => {};
let listenHandlers = null;
let speechGeneration = 0;
let speechAbortController = null;
let activePlaybackId = null;
const sidecarManager = new SidecarManager();
sidecarManager.onStatus(({ status }) => {
  if (status === 'restarting' || status === 'failed') {
    showSidecarError(OVERLAY_ERRORS.sidecarDown);
  } else if (status === 'healthy' && state.error === OVERLAY_ERRORS.sidecarDown) {
    state.error = null;
    state.status = 'idle';
    sendState();
  }
});

function stateSnapshot() {
  return {
    ...state,
    mode: conversation.getMode(),
    messages: conversation.getMessages(),
    listeningArmed: Boolean(listenHandlers?.isContinuousSessionActive?.()),
  };
}

function sendState() {
  if (overlay && !overlay.isDestroyed()) {
    overlay.webContents.send('state', stateSnapshot());
  }
}

function sendOverlay(channel, payload) {
  if (overlay && !overlay.isDestroyed()) {
    overlay.webContents.send(channel, payload);
  }
}

function stopSpeech({ resetStatus = true } = {}) {
  speechGeneration += 1;
  speechAbortController?.abort();
  speechAbortController = null;
  activePlaybackId = null;
  sendOverlay('stop-audio');

  if (resetStatus && state.status === 'speaking') {
    state.status = 'idle';
    sendState();
  }
}

async function speakAnswer(client, answer) {
  // TTS disabled — text-only replies.
  if (!TTS_ENABLED) return;
  const generation = ++speechGeneration;
  const controller = new AbortController();
  speechAbortController?.abort();
  speechAbortController = controller;
  activePlaybackId = null;
  sendOverlay('stop-audio');
  state.status = 'speaking';
  sendState();

  try {
    const audio = await tts.synthesize(client, answer, 'alloy', {
      signal: controller.signal,
    });
    if (generation !== speechGeneration || controller.signal.aborted || state.muted) return;

    const playbackId = `speech-${generation}`;
    activePlaybackId = playbackId;
    sendOverlay('play-audio', { id: playbackId, audio });
  } catch (error) {
    if (generation !== speechGeneration || controller.signal.aborted) return;
    state.status = 'idle';
    state.error = 'Answer ready, but speech could not be played.';
    sendState();
  } finally {
    if (speechAbortController === controller) speechAbortController = null;
  }
}

function isOverlaySender(event) {
  return overlay && !overlay.isDestroyed() && event.sender === overlay.webContents;
}

function isSettingsSender(event) {
  return (
    settingsWindow &&
    !settingsWindow.isDestroyed() &&
    event.sender === settingsWindow.webContents
  );
}

function showSidecarError(message) {
  state.status = 'error';
  state.error = message;
  sendState();
}

function showOverlay() {
  if (overlay && !overlay.isDestroyed() && !overlay.isVisible()) {
    overlay.showInactive();
  }
}

function ensureListenHandlers() {
  if (listenHandlers) return listenHandlers;
  listenHandlers = createListenHandlers(state, {
    sidecarClient,
    getSettings,
    getMode: () => conversation.getMode(),
    sendState,
    showSidecarError,
    runTurn,
  });
  return listenHandlers;
}

async function startListen() {
  showOverlay();
  if (state.status === 'speaking') stopSpeech();
  return ensureListenHandlers().startListen({ endpointing: false });
}

function stopListen() {
  return ensureListenHandlers().stopListen();
}

function toggleListen() {
  showOverlay();
  if (state.status === 'speaking') stopSpeech();
  ensureListenHandlers().toggleListen();
}

function toggleContinuousSession() {
  showOverlay();
  if (state.status === 'speaking') stopSpeech();
  ensureListenHandlers().toggleContinuousSession();
  sendState();
}

function activateListenControl() {
  showOverlay();
  if (state.status === 'speaking') stopSpeech();
  const settings = getSettings();
  if (settings.pressStyle === 'toggle') {
    ensureListenHandlers().toggleListen();
  } else {
    // continuous (default) and hold-from-button both use session toggle
    ensureListenHandlers().toggleContinuousSession();
  }
  sendState();
}

async function scanPrimaryScreen() {
  if (conversation.getMode() !== 'interview') {
    return false;
  }
  if (state.status === 'thinking') {
    return false;
  }

  showOverlay();
  state.status = 'thinking';
  state.error = null;
  state.lastTurnFailed = false;
  state.heard = 'Screen scan';
  sendState();

  try {
    const settings = getSettings();
    if (!settings.apiKey) {
      throw new Error('Missing API key');
    }

    const { dataUrl, width, height } = await capturePrimaryScreenPngDataUrl();
    const client = openaiClient.createClient(settings.apiKey);
    // No OpenAI "medium" detail — only low / high / auto.
    // gpt-4o-mini + high ≈ 35k tiles. gpt-4o + high ≈ 0.8–1.2k tiles (reads small TOC text).
    // gpt-4o + low ≈ 85 image tokens but often misses dense sidebar lists unless zoomed.
    const { answer, usage } = await openaiClient.chatWithImage(client, {
      model: 'gpt-4o',
      system: systemForScreenScan(),
      prompt:
        'Read the entire screenshot, including sidebars and numbered question lists. Answer every interview question you can see. If there are multiple, number the answers to match the on-screen numbering. Reply with only the answers.',
      dataUrl,
      detail: 'high',
    });
    console.log(
      '[scan]',
      JSON.stringify({
        width,
        height,
        payloadKb: Math.round((dataUrl.length * 0.75) / 1024),
        usage,
      }),
    );

    if (!answer) {
      throw new Error('Empty OpenAI response');
    }

    conversation.appendUser('[Screen scan]');
    conversation.appendAssistant(answer);
    state.error = null;
    state.lastTurnFailed = false;
    state.status = 'idle';
    sendState();
    return true;
  } catch (error) {
    state.status = 'error';
    const detail = String(error?.message || '');
    state.error = /screen capture|empty image|sources/i.test(detail)
      ? 'Could not capture the screen. Check Windows screen-capture permission.'
      : openAiErrorMessage(error);
    state.lastTurnFailed = false;
    sendState();
    return false;
  }
}

function clearListenTimeout() {
  ensureListenHandlers().clearListenTimeout();
}

function nativeHotkeyBinding(accelerator, UiohookKey) {
  const tokens = accelerator.split('+').map((token) => token.trim()).filter(Boolean);
  const modifiers = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
  let keyName = null;

  for (const token of tokens) {
    const normalized = token.toLowerCase();
    if (['commandorcontrol', 'cmdorctrl'].includes(normalized)) {
      modifiers[process.platform === 'darwin' ? 'metaKey' : 'ctrlKey'] = true;
    } else if (['command', 'cmd', 'super'].includes(normalized)) {
      modifiers.metaKey = true;
    } else if (['control', 'ctrl'].includes(normalized)) {
      modifiers.ctrlKey = true;
    } else if (['option', 'alt'].includes(normalized)) {
      modifiers.altKey = true;
    } else if (normalized === 'shift') {
      modifiers.shiftKey = true;
    } else if (keyName === null) {
      keyName = token.length === 1 ? token.toUpperCase() : token;
    } else {
      return null;
    }
  }

  const resolvedKeyName =
    keyName === null
      ? null
      : Object.keys(UiohookKey).find((name) => name.toLowerCase() === keyName.toLowerCase());
  const keycode = resolvedKeyName === null ? undefined : UiohookKey[resolvedKeyName];
  if (!Number.isInteger(keycode)) return null;
  return { keycode, modifiers };
}

function registerNativeHoldHotkey(accelerator) {
  try {
    const { uIOhook, UiohookKey } = require('uiohook-napi');
    const binding = nativeHotkeyBinding(accelerator, UiohookKey);
    if (!binding) return false;

    let pressed = false;
    const matches = (event) =>
      event.keycode === binding.keycode &&
      Object.entries(binding.modifiers).every(([key, expected]) => event[key] === expected);
    const onKeyDown = (event) => {
      if (!pressed && matches(event)) {
        pressed = true;
        void startListen();
      }
    };
    const onKeyUp = (event) => {
      if (pressed && event.keycode === binding.keycode) {
        pressed = false;
        void stopListen();
      }
    };

    uIOhook.on('keydown', onKeyDown);
    uIOhook.on('keyup', onKeyUp);
    uIOhook.start();
    unregisterHotkey = () => {
      uIOhook.removeListener('keydown', onKeyDown);
      uIOhook.removeListener('keyup', onKeyUp);
      uIOhook.stop();
    };
    return true;
  } catch {
    return false;
  }
}

function registerConfiguredHotkey() {
  unregisterHotkey();
  unregisterHotkey = () => {};
  globalShortcut.unregisterAll();

  const settings = getSettings();
  if (settings.pressStyle === 'hold' && registerNativeHoldHotkey(settings.hotkey)) return;

  const handler =
    settings.pressStyle === 'toggle' ? toggleListen : toggleContinuousSession;

  if (!globalShortcut.register(settings.hotkey, handler)) {
    showSidecarError(`Could not register global hotkey: ${settings.hotkey}`);
    return;
  }
  unregisterHotkey = () => globalShortcut.unregister(settings.hotkey);
}

function shouldAppendUser(text) {
  const lastMessage = conversation.getMessages().at(-1);
  return !(lastMessage?.role === 'user' && lastMessage.content === text);
}

async function runTurn(transcript) {
  const text = typeof transcript === 'string' ? transcript.trim() : '';
  state.status = 'thinking';
  state.error = null;
  state.lastTurnFailed = false;
  sendState();

  if (!text) {
    state.status = 'idle';
    state.error = OVERLAY_ERRORS.silence;
    state.heard = null;
    sendState();
    return null;
  }

  state.heard = text;
  if (shouldAppendUser(text)) conversation.appendUser(text);
  sendState();

  try {
    const settings = getSettings();
    if (!settings.apiKey) {
      throw new Error('Missing API key');
    }

    const client = openaiClient.createClient(settings.apiKey);
    const answer = await openaiClient.chat(client, {
      model: settings.model,
      system: systemFor(conversation.getMode()),
      messages: conversation.getMessages(),
    });
    if (!answer) {
      throw new Error('Empty OpenAI response');
    }

    conversation.appendAssistant(answer);
    state.error = null;
    state.lastTurnFailed = false;
    if (TTS_ENABLED && !state.muted && settings.ttsEnabled) state.status = 'speaking';
    sendState();
    if (TTS_ENABLED && !state.muted && settings.ttsEnabled) {
      await speakAnswer(client, answer);
    } else {
      state.status = 'idle';
      sendState();
    }
    return answer;
  } catch (error) {
    state.status = 'error';
    state.error = openAiErrorMessage(error);
    state.lastTurnFailed = true;
    sendState();
    return null;
  }
}

async function restartSidecar() {
  try {
    await sidecarManager.stop();
    sidecarManager.start();
    await sidecarManager.ensureHealthy();
    if (state.error === OVERLAY_ERRORS.sidecarDown) {
      state.error = null;
      state.status = 'idle';
      sendState();
    }
  } catch {
    showSidecarError(OVERLAY_ERRORS.sidecarDown);
  }
}

function registerIpcHandlers() {
  ipcMain.handle('set-mode', (event, mode) => {
    const nextMode = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
    if (!isOverlaySender(event) || !MODES.has(nextMode)) {
      return stateSnapshot();
    }

    conversation.setMode(nextMode);
    sendState();
    return stateSnapshot();
  });

  ipcMain.handle('clear-conversation', (event) => {
    if (!isOverlaySender(event)) return stateSnapshot();
    stopSpeech();
    conversation.clear();
    state.error = null;
    state.heard = null;
    state.lastTurnFailed = false;
    sendState();
    return stateSnapshot();
  });

  ipcMain.handle('toggle-mute', (event) => {
    if (!TTS_ENABLED) return stateSnapshot();
    if (!isOverlaySender(event)) return stateSnapshot();
    state.muted = !state.muted;
    if (state.muted) stopSpeech();
    sendState();
    return stateSnapshot();
  });

  ipcMain.handle('audio-ended', (event, playbackId) => {
    if (!isOverlaySender(event) || playbackId !== activePlaybackId) return false;
    activePlaybackId = null;
    if (state.status === 'speaking') {
      state.status = 'idle';
      sendState();
    }
    return true;
  });

  ipcMain.handle('copy-last', (event) => {
    if (!isOverlaySender(event)) return false;
    const lastMessage = conversation.getMessages().at(-1);
    if (!lastMessage || typeof lastMessage.content !== 'string') return false;
    clipboard.writeText(lastMessage.content);
    return true;
  });

  ipcMain.handle('hide-overlay', (event) => {
    if (!isOverlaySender(event)) return false;
    overlay.hide();
    return true;
  });

  ipcMain.handle('quit-app', (event) => {
    if (!isOverlaySender(event)) return false;
    app.quit();
    return true;
  });

  ipcMain.handle('toggle-listen', (event) => {
    if (!isOverlaySender(event)) return stateSnapshot();
    activateListenControl();
    return stateSnapshot();
  });

  ipcMain.handle('scan-screen', async (event) => {
    if (!isOverlaySender(event)) return false;
    return scanPrimaryScreen();
  });

  ipcMain.handle('open-settings', (event) => {
    if (!isOverlaySender(event)) return false;
    createSettingsWindow();
    return true;
  });

  ipcMain.handle('retry-turn', async (event) => {
    if (!isOverlaySender(event) || !state.lastTurnFailed || !state.heard) return false;
    await runTurn(state.heard);
    return true;
  });

  ipcMain.handle('settings-get', (event) => {
    if (!isSettingsSender(event)) throw new Error('Unauthorized settings request');
    return toPublicSettings(getSettings());
  });

  ipcMain.handle('settings-save', async (event, partial) => {
    if (!isSettingsSender(event)) throw new Error('Unauthorized settings request');
    const previous = getSettings();
    const saved = saveSettings(partial);
    if (
      saved.sidecarPython !== previous.sidecarPython ||
      saved.whisperModel !== previous.whisperModel
    ) {
      void restartSidecar();
    }
    if (saved.hotkey !== previous.hotkey || saved.pressStyle !== previous.pressStyle) {
      registerConfiguredHotkey();
    }
    if (!saved.ttsEnabled && previous.ttsEnabled) {
      stopSpeech();
    }
    return toPublicSettings(saved);
  });

  ipcMain.handle('sidecar-devices', async (event) => {
    if (!isSettingsSender(event)) throw new Error('Unauthorized sidecar request');
    return sidecarClient.devices();
  });
}

function secureWebPreferences(preloadFile = 'preload.js') {
  return {
    preload: path.join(__dirname, preloadFile),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
}

function lockWindowNavigation(win) {
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
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
    webPreferences: secureWebPreferences(),
  });

  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setContentProtection(true);
  lockWindowNavigation(overlay);
  overlay.webContents.on('did-finish-load', () => {
    sendState();
    overlay.show();
  });
  overlay.on('closed', () => {
    overlay = null;
  });
  overlay.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 640,
    height: 760,
    minWidth: 520,
    minHeight: 600,
    parent: overlay || undefined,
    show: false,
    title: 'Jarvis Settings',
    webPreferences: secureWebPreferences(),
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.setContentProtection(true);
  lockWindowNavigation(settingsWindow);
  settingsWindow.webContents.on('did-finish-load', () => settingsWindow?.show());
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
}

app.whenReady().then(() => {
  registerIpcHandlers();
  const settings = getSettings();
  conversation.setMode(settings.defaultMode);
  state.muted = !settings.ttsEnabled;
  createOverlay();
  registerConfiguredHotkey();
  sidecarManager.start();
  void sidecarManager.ensureHealthy().catch(() => {
    showSidecarError(OVERLAY_ERRORS.sidecarDown);
  });
});

app.on('activate', () => {
  if (!overlay) createOverlay();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  stopSpeech({ resetStatus: false });
  clearListenTimeout();
  unregisterHotkey();
  globalShortcut.unregisterAll();
  void sidecarManager.stop().finally(() => {
    quitting = true;
    app.quit();
  });
});

module.exports = { runTurn };
