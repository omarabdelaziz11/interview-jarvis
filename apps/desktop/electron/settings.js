const path = require('path');
const { safeStorage } = require('electron');
const Store = require('electron-store');

const store = new Store({ name: 'jarvis-settings' });

const DEFAULTS = Object.freeze({
  model: 'gpt-4o-mini',
  whisperModel: 'base',
  hotkey: 'CommandOrControl+Shift+Space',
  pressStyle: 'hold',
  defaultMode: 'jarvis',
  ttsEnabled: true,
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

const STRING_FIELDS = new Set(['model', 'whisperModel', 'hotkey', 'sidecarPython']);
const DEVICE_FIELDS = new Set(['micDeviceId', 'loopbackDeviceId']);

function normalizeSettings(partial) {
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
    throw new TypeError('Settings must be an object');
  }

  const normalized = {};
  for (const [key, value] of Object.entries(partial)) {
    if (STRING_FIELDS.has(key)) {
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
      if (!['hold', 'toggle'].includes(value)) throw new TypeError('Invalid press style');
      normalized[key] = value;
    } else if (key === 'defaultMode') {
      if (!['jarvis', 'interview'].includes(value)) throw new TypeError('Invalid default mode');
      normalized[key] = value;
    } else if (key === 'ttsEnabled') {
      if (typeof value !== 'boolean') throw new TypeError('ttsEnabled must be a boolean');
      normalized[key] = value;
    } else if (key === 'apiKey') {
      if (typeof value !== 'string' || value.length > 4096) {
        throw new TypeError('apiKey must be a string');
      }
      normalized.apiKey = value.trim();
    }
  }
  return normalized;
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

module.exports = { DEFAULTS, getSettings, saveSettings };
