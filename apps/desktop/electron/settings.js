const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');
const Store = require('electron-store');

const store = new Store({ name: 'jarvis-settings' });

const ALLOWED_CHAT_MODELS = Object.freeze([
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1-mini',
  'gpt-4.1',
  'o4-mini',
]);

const ALLOWED_WHISPER_MODELS = Object.freeze(['tiny', 'base', 'small']);

const DEFAULTS = Object.freeze({
  model: 'gpt-4o-mini',
  whisperModel: 'small',
  hotkey: 'CommandOrControl+Shift+Space',
  pressStyle: 'continuous',
  defaultMode: 'jarvis',
  ttsEnabled: false, // TTS disabled — text-only replies; do not re-enable without restoring UI
  micDeviceId: null,
  loopbackDeviceId: null,
  sidecarPython: path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'services',
    'sidecar',
    '.venv',
    'Scripts',
    'python.exe',
  ),
});

const STRING_FIELDS = new Set(['hotkey']);
const DEVICE_FIELDS = new Set(['micDeviceId', 'loopbackDeviceId']);

function isAllowedPythonExecutable(candidate) {
  if (typeof candidate !== 'string' || !candidate.trim() || candidate.length > 1024) {
    return false;
  }
  const resolved = path.resolve(candidate.trim());
  const base = path.basename(resolved).toLowerCase();
  if (base !== 'python.exe' && base !== 'python' && base !== 'python3.exe' && base !== 'python3') {
    return false;
  }
  if (!fs.existsSync(resolved)) {
    return false;
  }
  // Prefer the repo sidecar venv; still allow another local python*.exe that exists.
  return true;
}

function normalizeSettings(partial) {
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
    throw new TypeError('Settings must be an object');
  }

  const normalized = {};
  for (const [key, value] of Object.entries(partial)) {
    if (key === 'model') {
      if (typeof value !== 'string' || !ALLOWED_CHAT_MODELS.includes(value.trim())) {
        throw new TypeError(`model must be one of: ${ALLOWED_CHAT_MODELS.join(', ')}`);
      }
      normalized.model = value.trim();
    } else if (key === 'whisperModel') {
      if (typeof value !== 'string' || !ALLOWED_WHISPER_MODELS.includes(value.trim())) {
        throw new TypeError(`whisperModel must be one of: ${ALLOWED_WHISPER_MODELS.join(', ')}`);
      }
      normalized.whisperModel = value.trim();
    } else if (key === 'sidecarPython') {
      if (!isAllowedPythonExecutable(value)) {
        throw new TypeError('sidecarPython must be an existing python executable');
      }
      normalized.sidecarPython = path.resolve(String(value).trim());
    } else if (STRING_FIELDS.has(key)) {
      if (typeof value !== 'string' || !value.trim() || value.length > 1024) {
        throw new TypeError(`${key} must be a non-empty string`);
      }
      normalized[key] = value.trim();
    } else if (DEVICE_FIELDS.has(key)) {
      if (value !== null && typeof value !== 'string' && !Number.isInteger(value)) {
        throw new TypeError(`${key} must be a string, integer, or null`);
      }
      normalized[key] = value;
    } else if (key === 'pressStyle') {
      if (!['hold', 'toggle', 'continuous'].includes(value)) {
        throw new TypeError('Invalid press style');
      }
      normalized[key] = value;
    } else if (key === 'defaultMode') {
      if (!['jarvis', 'interview'].includes(value)) throw new TypeError('Invalid default mode');
      normalized[key] = value;
    } else if (key === 'ttsEnabled') {
      // TTS is disabled in the product UI; ignore attempts to turn it on.
      normalized.ttsEnabled = false;
    } else if (key === 'apiKey') {
      if (typeof value !== 'string' || value.length > 4096) {
        throw new TypeError('apiKey must be a string');
      }
      normalized.apiKey = value.trim();
    }
  }
  return normalized;
}

function sanitizeLoadedPrefs(data) {
  if (!ALLOWED_CHAT_MODELS.includes(data.model)) {
    data.model = DEFAULTS.model;
  }
  if (!ALLOWED_WHISPER_MODELS.includes(data.whisperModel)) {
    data.whisperModel = DEFAULTS.whisperModel;
  }
  if (!isAllowedPythonExecutable(data.sidecarPython)) {
    data.sidecarPython = DEFAULTS.sidecarPython;
  } else {
    data.sidecarPython = path.resolve(data.sidecarPython);
  }
  return data;
}

function getSettings() {
  const prefs = store.get('prefs', {});
  const data = { ...DEFAULTS, ...(prefs && typeof prefs === 'object' ? prefs : {}) };
  const encrypted = store.get('apiKeyEnc');

  data.apiKey = process.env.OPENAI_API_KEY || '';
  if (typeof encrypted === 'string' && encrypted && safeStorage.isEncryptionAvailable()) {
    try {
      data.apiKey = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch {
      // Keep the environment fallback when stored credentials cannot be decrypted.
    }
  }

  sanitizeLoadedPrefs(data);

  // Persist corrected sidecar path / allowlists when prefs drifted (e.g. old worktree).
  const nextPrefs = { ...(prefs && typeof prefs === 'object' ? prefs : {}) };
  let dirty = false;
  for (const key of ['model', 'whisperModel', 'sidecarPython']) {
    if (nextPrefs[key] !== data[key]) {
      nextPrefs[key] = data[key];
      dirty = true;
    }
  }
  if (dirty) {
    store.set('prefs', nextPrefs);
  }

  // TTS disabled in product UI — never expose as enabled.
  data.ttsEnabled = false;
  return data;
}

function saveSettings(partial) {
  const normalized = normalizeSettings(partial);
  const { apiKey, ...preferenceChanges } = normalized;
  const prefs = { ...store.get('prefs', {}), ...preferenceChanges };

  if (Object.hasOwn(normalized, 'apiKey')) {
    if (apiKey) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('Secure credential storage is unavailable');
      }
      store.set('apiKeyEnc', safeStorage.encryptString(apiKey).toString('base64'));
    } else {
      store.delete('apiKeyEnc');
    }
  }

  store.set('prefs', prefs);
  return getSettings();
}

module.exports = {
  DEFAULTS,
  ALLOWED_CHAT_MODELS,
  ALLOWED_WHISPER_MODELS,
  getSettings,
  saveSettings,
  isAllowedPythonExecutable,
};
