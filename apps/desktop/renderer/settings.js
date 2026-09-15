const form = document.querySelector('#settings-form');
const statusElement = document.querySelector('#form-status');
const refreshButton = document.querySelector('#refresh-devices');
const fields = {
  apiKey: document.querySelector('#api-key'),
  model: document.querySelector('#model'),
  whisperModel: document.querySelector('#whisper-model'),
  hotkey: document.querySelector('#hotkey'),
  pressStyle: document.querySelector('#press-style'),
  defaultMode: document.querySelector('#default-mode'),
  ttsEnabled: document.querySelector('#tts-enabled'),
  micDeviceId: document.querySelector('#mic-device'),
  loopbackDeviceId: document.querySelector('#loopback-device'),
  sidecarPython: document.querySelector('#sidecar-python'),
};

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.dataset.error = String(isError);
}

function acceleratorFromKeyboardEvent(event) {
  const aliases = {
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
  };
  const modifierKeys = new Set(['Alt', 'Control', 'Meta', 'Shift']);
  if (modifierKeys.has(event.key)) return null;

  const key = aliases[event.key] || (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  const modifiers = [];
  if (event.ctrlKey || event.metaKey) modifiers.push('CommandOrControl');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  return [...modifiers, key].join('+');
}

function encodeDeviceId(value) {
  return JSON.stringify(value);
}

function decodeDeviceId(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function populateDeviceSelect(select, devices, kind, selectedId) {
  select.replaceChildren();

  const defaultOption = document.createElement('option');
  defaultOption.value = encodeDeviceId(null);
  defaultOption.textContent = 'System default';
  select.append(defaultOption);

  for (const device of devices) {
    if (
      !device ||
      device.kind !== kind ||
      (typeof device.id !== 'string' && !Number.isInteger(device.id)) ||
      typeof device.name !== 'string'
    ) {
      continue;
    }
    const option = document.createElement('option');
    option.value = encodeDeviceId(device.id);
    option.textContent = device.name;
    select.append(option);
  }

  const selectedValue = encodeDeviceId(selectedId);
  if (![...select.options].some((option) => option.value === selectedValue)) {
    const unavailableOption = document.createElement('option');
    unavailableOption.value = selectedValue;
    unavailableOption.textContent = `Unavailable device (${String(selectedId)})`;
    select.append(unavailableOption);
  }
  select.value = selectedValue;
}

async function loadDevices(selected = {}) {
  refreshButton.disabled = true;
  try {
    const response = await window.jarvis.getDevices();
    const devices = Array.isArray(response?.devices) ? response.devices : [];
    populateDeviceSelect(fields.micDeviceId, devices, 'mic', selected.micDeviceId ?? null);
    populateDeviceSelect(
      fields.loopbackDeviceId,
      devices,
      'loopback',
      selected.loopbackDeviceId ?? null,
    );
    setStatus('');
  } catch {
    populateDeviceSelect(fields.micDeviceId, [], 'mic', selected.micDeviceId ?? null);
    populateDeviceSelect(
      fields.loopbackDeviceId,
      [],
      'loopback',
      selected.loopbackDeviceId ?? null,
    );
    setStatus('Could not load audio devices. Check the sidecar path.', true);
  } finally {
    refreshButton.disabled = false;
  }
}

function renderSettings(settings) {
  fields.apiKey.value = '';
  fields.apiKey.placeholder = settings.hasApiKey ? 'Saved securely — enter a new key to replace' : '';
  fields.model.value = settings.model || '';
  fields.whisperModel.value = settings.whisperModel || '';
  fields.hotkey.value = settings.hotkey || '';
  fields.pressStyle.value = settings.pressStyle || 'hold';
  fields.defaultMode.value = settings.defaultMode || 'jarvis';
  fields.ttsEnabled.checked = Boolean(settings.ttsEnabled);
  fields.sidecarPython.value = settings.sidecarPython || '';
}

async function initialize() {
  try {
    const settings = await window.jarvis.getSettings();
    renderSettings(settings);
    await loadDevices(settings);
  } catch {
    setStatus('Could not load settings.', true);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;
  setStatus('Saving…');

  try {
    const changes = {
      model: fields.model.value,
      whisperModel: fields.whisperModel.value,
      hotkey: fields.hotkey.value,
      pressStyle: fields.pressStyle.value,
      defaultMode: fields.defaultMode.value,
      ttsEnabled: fields.ttsEnabled.checked,
      micDeviceId: decodeDeviceId(fields.micDeviceId.value),
      loopbackDeviceId: decodeDeviceId(fields.loopbackDeviceId.value),
      sidecarPython: fields.sidecarPython.value,
    };
    if (fields.apiKey.value.trim()) changes.apiKey = fields.apiKey.value;
    const saved = await window.jarvis.saveSettings(changes);
    renderSettings(saved);
    setStatus('Settings saved.');
  } catch (error) {
    setStatus(error?.message || 'Could not save settings.', true);
  } finally {
    submitButton.disabled = false;
  }
});

refreshButton.addEventListener('click', () =>
  loadDevices({
    micDeviceId: decodeDeviceId(fields.micDeviceId.value),
    loopbackDeviceId: decodeDeviceId(fields.loopbackDeviceId.value),
  }),
);

fields.hotkey.addEventListener('keydown', (event) => {
  event.preventDefault();
  const accelerator = acceleratorFromKeyboardEvent(event);
  if (accelerator) fields.hotkey.value = accelerator;
});

initialize();
