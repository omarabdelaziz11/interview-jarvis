# Jarvis Overlay Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows Electron overlay + Python Faster-Whisper sidecar that, on hotkey, captures mic+system audio, transcribes, replies via OpenAI (Jarvis or Interview mode), shows capture-protected on-screen text, and optionally speaks via OpenAI TTS.

**Architecture:** Electron owns UI, hotkeys, content protection, conversation, OpenAI, and sidecar lifecycle. A Python FastAPI sidecar exposes localhost HTTP for device listing, start/stop recording, and Whisper transcription. Overlay uses `setContentProtection(true)`.

**Tech Stack:** Electron 33+, vanilla HTML/CSS/JS renderer, Node 20+, Python 3.10+, FastAPI + uvicorn, sounddevice (WASAPI loopback), faster-whisper, OpenAI Node SDK, electron-store + safeStorage for settings.

**Spec:** `docs/superpowers/specs/2026-09-15-jarvis-overlay-design.md`

## Global Constraints

- Platform: Windows 10/11 only for v1
- STT: local Faster Whisper (user-installed; path configurable)
- LLM + TTS: OpenAI API (key in safeStorage)
- Audio: mic + system loopback mixed; max capture **180 seconds**
- Hotkey default: `Ctrl+Shift+Space` (hold-to-talk default; toggle optional)
- Overlay always `setContentProtection(true)`
- Sidecar IPC: localhost HTTP JSON
- Empty/silence transcript → do not call OpenAI
- While Thinking, ignore new hotkey (no queue)
- No always-on listening, no local LLM, no click-through in v1

---

## File Structure

```
/
  package.json                          # workspace root scripts
  .gitignore
  README.md
  apps/desktop/
    package.json
    electron/
      main.js                           # app entry, windows, hotkeys
      preload.js                        # contextBridge API
      conversation.js                   # history + modes
      openai-client.js                  # chat + TTS
      sidecar-client.js                 # HTTP client to Python
      sidecar-manager.js                # spawn / health / restart
      settings.js                       # load/save + safeStorage key
      prompts.js                        # Jarvis + Interview system prompts
    renderer/
      overlay.html
      overlay.css
      overlay.js
      settings.html
      settings.css
      settings.js
  services/sidecar/
    requirements.txt
    pyproject.toml                      # optional; requirements.txt is enough
    app/
      __init__.py
      main.py                           # FastAPI app + uvicorn entry
      audio_capture.py                  # mic + loopback record/mix
      transcribe.py                     # Faster Whisper wrapper
      devices.py                        # list input + loopback devices
      schema.py                         # pydantic models
    tests/
      test_schema.py
      test_audio_mix.py
      test_transcribe_empty.py
  docs/superpowers/specs/2026-09-15-jarvis-overlay-design.md
  docs/superpowers/plans/2026-09-15-jarvis-overlay.md
```

---

### Task 1: Repo scaffold + Python sidecar HTTP skeleton

**Files:**
- Create: `.gitignore`
- Create: `README.md`
- Create: `services/sidecar/requirements.txt`
- Create: `services/sidecar/app/__init__.py`
- Create: `services/sidecar/app/schema.py`
- Create: `services/sidecar/app/main.py`
- Create: `services/sidecar/tests/test_schema.py`
- Create: `services/sidecar/tests/test_health.py`

**Interfaces:**
- Consumes: none
- Produces:
  - `GET /health` → `{ "ok": true, "whisper_ready": bool }`
  - Pydantic models in `schema.py`: `HealthResponse`, `TranscriptResponse`, `ErrorResponse`, `StartListenRequest`, `DeviceInfo`, `DevicesResponse`

- [ ] **Step 1: Init git and ignore junk**

```bash
cd "D:\Interview Agent"
git init
```

Write `.gitignore`:

```
node_modules/
dist/
out/
.env
*.pyc
__pycache__/
.venv/
venv/
*.wav
*.log
.DS_Store
apps/desktop/config.json
```

- [ ] **Step 2: Write failing schema/health tests**

`services/sidecar/tests/test_schema.py`:

```python
from app.schema import HealthResponse, TranscriptResponse


def test_health_response_defaults():
    h = HealthResponse(ok=True, whisper_ready=False)
    assert h.ok is True
    assert h.whisper_ready is False


def test_transcript_response_fields():
    t = TranscriptResponse(text="hello", duration_sec=1.5)
    assert t.text == "hello"
    assert t.duration_sec == 1.5
```

`services/sidecar/tests/test_health.py`:

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_ok():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "whisper_ready" in body
```

- [ ] **Step 3: Run tests — expect fail**

```bash
cd "D:\Interview Agent\services\sidecar"
python -m venv .venv
.\.venv\Scripts\activate
pip install fastapi uvicorn pydantic pytest httpx
pytest tests/test_schema.py tests/test_health.py -v
```

Expected: FAIL (modules missing)

- [ ] **Step 4: Implement skeleton**

`services/sidecar/requirements.txt`:

```
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
pydantic>=2.9.0
numpy>=1.26.0
sounddevice>=0.5.0
faster-whisper>=1.1.0
pytest>=8.0.0
httpx>=0.27.0
```

`services/sidecar/app/schema.py`:

```python
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    ok: bool = True
    whisper_ready: bool = False


class DeviceInfo(BaseModel):
    id: int | str
    name: str
    kind: str  # "mic" | "loopback"


class DevicesResponse(BaseModel):
    devices: list[DeviceInfo]


class StartListenRequest(BaseModel):
    mic_device_id: int | str | None = None
    loopback_device_id: int | str | None = None
    max_seconds: int = Field(default=180, ge=1, le=180)


class TranscriptResponse(BaseModel):
    text: str
    duration_sec: float


class ErrorResponse(BaseModel):
    error: str
```

`services/sidecar/app/main.py`:

```python
from fastapi import FastAPI
from app.schema import HealthResponse

app = FastAPI(title="Jarvis Sidecar")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(ok=True, whisper_ready=False)


def run() -> None:
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8765, reload=False)


if __name__ == "__main__":
    run()
```

`services/sidecar/app/__init__.py`: empty

- [ ] **Step 5: Run tests — expect pass**

```bash
cd "D:\Interview Agent\services\sidecar"
.\.venv\Scripts\activate
pip install -r requirements.txt
pytest tests/test_schema.py tests/test_health.py -v
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add .gitignore README.md services/sidecar
git commit -m "feat: scaffold Python sidecar health API"
```

Write a short `README.md` stating: Windows Jarvis overlay; Electron + Faster Whisper sidecar; see design spec.

---

### Task 2: Device listing + audio capture/mix

**Files:**
- Create: `services/sidecar/app/devices.py`
- Create: `services/sidecar/app/audio_capture.py`
- Create: `services/sidecar/tests/test_audio_mix.py`
- Modify: `services/sidecar/app/main.py`

**Interfaces:**
- Consumes: `StartListenRequest` from Task 1
- Produces:
  - `list_devices() -> DevicesResponse`
  - `AudioSession` class: `start(...)`, `stop() -> tuple[np.ndarray, int]` (float32 mono PCM + sample_rate)
  - `GET /devices` → `DevicesResponse`
  - `POST /listen/start` → `{ "status": "listening" }`
  - `POST /listen/stop` → `TranscriptResponse` (transcript wired in Task 3; for now return empty text + duration)

- [ ] **Step 1: Write mix unit test (no hardware)**

`services/sidecar/tests/test_audio_mix.py`:

```python
import numpy as np
from app.audio_capture import mix_to_mono


def test_mix_to_mono_averages_channels():
    # shape (samples, 2)
    stereo = np.array([[1.0, -1.0], [0.5, 0.5]], dtype=np.float32)
    mono = mix_to_mono(stereo)
    assert mono.shape == (2,)
    assert abs(float(mono[0]) - 0.0) < 1e-6
    assert abs(float(mono[1]) - 0.5) < 1e-6


def test_mix_to_mono_passthrough():
    mono_in = np.array([0.1, 0.2], dtype=np.float32)
    out = mix_to_mono(mono_in)
    assert out.shape == (2,)
    assert abs(float(out[0]) - 0.1) < 1e-6
```

- [ ] **Step 2: Run test — expect fail**

```bash
pytest tests/test_audio_mix.py -v
```

Expected: FAIL import error

- [ ] **Step 3: Implement devices + capture**

`services/sidecar/app/devices.py`:

```python
import sounddevice as sd
from app.schema import DeviceInfo, DevicesResponse


def list_devices() -> DevicesResponse:
    devices: list[DeviceInfo] = []
    hostapis = sd.query_hostapis()
    wasapi_index = next(
        (i for i, h in enumerate(hostapis) if "WASAPI" in h["name"]),
        None,
    )
    for idx, dev in enumerate(sd.query_devices()):
        name = str(dev["name"])
        max_in = int(dev["max_input_channels"])
        is_wasapi = wasapi_index is not None and dev["hostapi"] == wasapi_index
        # Loopback devices often appear as output hosts with input channels on WASAPI
        if max_in > 0:
            kind = "loopback" if is_wasapi and ("loopback" in name.lower() or "[loopback]" in name.lower()) else "mic"
            # Also mark default output's loopback separately in audio_capture when needed
            devices.append(DeviceInfo(id=idx, name=name, kind=kind))
    return DevicesResponse(devices=devices)
```

`services/sidecar/app/audio_capture.py`:

```python
from __future__ import annotations

import threading
import time
from typing import Any

import numpy as np
import sounddevice as sd


SAMPLE_RATE = 16000


def mix_to_mono(audio: np.ndarray) -> np.ndarray:
    if audio.ndim == 1:
        return audio.astype(np.float32, copy=False)
    return audio.mean(axis=1).astype(np.float32)


class AudioSession:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._recording = False
        self._chunks: list[np.ndarray] = []
        self._stream: Any | None = None
        self._started_at = 0.0
        self._max_seconds = 180
        self._timer: threading.Timer | None = None

    @property
    def recording(self) -> bool:
        return self._recording

    def start(
        self,
        mic_device_id: int | None,
        loopback_device_id: int | None,
        max_seconds: int = 180,
    ) -> None:
        with self._lock:
            if self._recording:
                raise RuntimeError("already listening")
            self._chunks = []
            self._max_seconds = max_seconds
            self._started_at = time.time()
            self._recording = True

            # Prefer explicit loopback; else try WASAPI loopback default
            device = loopback_device_id if loopback_device_id is not None else mic_device_id
            if device is None:
                device = None  # system default input

            def callback(indata, frames, time_info, status):  # noqa: ARG001
                if status:
                    pass
                if self._recording:
                    self._chunks.append(indata.copy())

            self._stream = sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype="float32",
                device=device,
                callback=callback,
            )
            self._stream.start()
            self._timer = threading.Timer(max_seconds, self._auto_stop)
            self._timer.daemon = True
            self._timer.start()

    def _auto_stop(self) -> None:
        try:
            if self._recording:
                self.stop()
        except Exception:
            pass

    def stop(self) -> tuple[np.ndarray, int, float]:
        with self._lock:
            if not self._recording and not self._chunks:
                return np.zeros(0, dtype=np.float32), SAMPLE_RATE, 0.0
            self._recording = False
            if self._timer:
                self._timer.cancel()
                self._timer = None
            if self._stream is not None:
                self._stream.stop()
                self._stream.close()
                self._stream = None
            duration = time.time() - self._started_at if self._started_at else 0.0
            if not self._chunks:
                return np.zeros(0, dtype=np.float32), SAMPLE_RATE, duration
            audio = np.concatenate(self._chunks, axis=0)
            mono = mix_to_mono(audio)
            self._chunks = []
            return mono, SAMPLE_RATE, duration


# Module-level session used by API
SESSION = AudioSession()
```

**Note for implementer:** On Windows, true system-audio loopback often needs `sounddevice` WASAPI loopback device (name contains loopback) or `WasapiSettings(loopback=True)` if the installed sounddevice version supports it. After implementing, manually verify YouTube audio appears in a test recording. If default `InputStream` only gets mic, extend `start()` to open **two** streams (mic + loopback) and sum mono buffers by min length:

```python
mixed = mic_mono[:n] + loop_mono[:n]
mixed = np.clip(mixed, -1.0, 1.0)
```

Wire that dual-stream path before Task 2 is considered done.

Wire routes in `main.py`:

```python
from fastapi import FastAPI, HTTPException
from app.schema import (
    DevicesResponse,
    HealthResponse,
    StartListenRequest,
    TranscriptResponse,
)
from app.devices import list_devices
from app.audio_capture import SESSION

app = FastAPI(title="Jarvis Sidecar")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(ok=True, whisper_ready=False)


@app.get("/devices", response_model=DevicesResponse)
def devices() -> DevicesResponse:
    return list_devices()


@app.post("/listen/start")
def listen_start(body: StartListenRequest) -> dict:
    try:
        SESSION.start(
            mic_device_id=body.mic_device_id if isinstance(body.mic_device_id, int) else None,
            loopback_device_id=body.loopback_device_id if isinstance(body.loopback_device_id, int) else None,
            max_seconds=body.max_seconds,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return {"status": "listening"}


@app.post("/listen/stop", response_model=TranscriptResponse)
def listen_stop() -> TranscriptResponse:
    audio, sr, duration = SESSION.stop()
    # Transcription hooked in Task 3
    return TranscriptResponse(text="", duration_sec=duration)
```

- [ ] **Step 4: Run unit tests**

```bash
pytest tests/test_audio_mix.py tests/test_health.py -v
```

Expected: PASS

- [ ] **Step 5: Manual device smoke**

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8765
curl http://127.0.0.1:8765/devices
```

Expected: JSON list including at least one mic; preferably a loopback device on WASAPI.

- [ ] **Step 6: Commit**

```bash
git add services/sidecar
git commit -m "feat: add WASAPI device list and audio capture session"
```

---

### Task 3: Faster Whisper transcription + silence gate

**Files:**
- Create: `services/sidecar/app/transcribe.py`
- Create: `services/sidecar/tests/test_transcribe_empty.py`
- Modify: `services/sidecar/app/main.py`
- Modify: `services/sidecar/app/schema.py` (optional `WhisperConfig` via env)

**Interfaces:**
- Consumes: mono `np.ndarray`, sample_rate from `AudioSession.stop`
- Produces:
  - `transcribe(audio: np.ndarray, sample_rate: int) -> str`
  - `is_silence(audio: np.ndarray, rms_threshold: float = 0.01) -> bool`
  - `POST /listen/stop` returns real transcript text
  - `GET /health` sets `whisper_ready` True after model load

- [ ] **Step 1: Write silence + empty tests**

`services/sidecar/tests/test_transcribe_empty.py`:

```python
import numpy as np
from app.transcribe import is_silence


def test_is_silence_true_for_zeros():
    assert is_silence(np.zeros(16000, dtype=np.float32)) is True


def test_is_silence_false_for_loud():
    audio = np.ones(16000, dtype=np.float32) * 0.2
    assert is_silence(audio) is False
```

- [ ] **Step 2: Run — expect fail**

```bash
pytest tests/test_transcribe_empty.py -v
```

- [ ] **Step 3: Implement Whisper wrapper**

`services/sidecar/app/transcribe.py`:

```python
from __future__ import annotations

import os
import threading

import numpy as np

_model = None
_lock = threading.Lock()


def is_silence(audio: np.ndarray, rms_threshold: float = 0.01) -> bool:
    if audio.size == 0:
        return True
    rms = float(np.sqrt(np.mean(np.square(audio), dtype=np.float64)))
    return rms < rms_threshold


def get_model():
    global _model
    with _lock:
        if _model is None:
            from faster_whisper import WhisperModel

            model_size = os.environ.get("WHISPER_MODEL", "base")
            device = os.environ.get("WHISPER_DEVICE", "cpu")
            compute = os.environ.get("WHISPER_COMPUTE", "int8")
            _model = WhisperModel(model_size, device=device, compute_type=compute)
        return _model


def whisper_ready() -> bool:
    try:
        get_model()
        return True
    except Exception:
        return False


def transcribe(audio: np.ndarray, sample_rate: int) -> str:
    if is_silence(audio):
        return ""
    model = get_model()
    segments, _info = model.transcribe(audio, language=None, vad_filter=True)
    parts = [seg.text.strip() for seg in segments if seg.text.strip()]
    return " ".join(parts).strip()
```

Update `listen_stop` and `health` in `main.py` to call `transcribe` / `whisper_ready`. On Whisper exception: retry once, then HTTP 500 with `{ "error": "..." }`.

- [ ] **Step 4: Tests pass**

```bash
pytest tests/ -v
```

- [ ] **Step 5: Manual listen round-trip**

```bash
# start server, then:
curl -X POST http://127.0.0.1:8765/listen/start -H "Content-Type: application/json" -d "{}"
# speak 3 seconds
curl -X POST http://127.0.0.1:8765/listen/stop
```

Expected: non-empty `text` when speech present; empty when silent.

- [ ] **Step 6: Commit**

```bash
git add services/sidecar
git commit -m "feat: integrate Faster Whisper transcription and silence gate"
```

---

### Task 4: Electron app shell + capture-protected overlay

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/electron/main.js`
- Create: `apps/desktop/electron/preload.js`
- Create: `apps/desktop/renderer/overlay.html`
- Create: `apps/desktop/renderer/overlay.css`
- Create: `apps/desktop/renderer/overlay.js`
- Create: `package.json` (root scripts)

**Interfaces:**
- Consumes: none yet
- Produces:
  - Overlay `BrowserWindow` with `setContentProtection(true)`, `alwaysOnTop: true`, transparent
  - preload API: `window.jarvis.onState(cb)`, `window.jarvis.setMode(mode)`, `window.jarvis.clearConversation()`, `window.jarvis.toggleMute()`, `window.jarvis.copyLast()`, `window.jarvis.hide()`
  - Main sends state `{ status, mode, messages, muted, error, heard }`

- [ ] **Step 1: Scaffold package.json**

Root `package.json`:

```json
{
  "name": "jarvis-overlay",
  "private": true,
  "scripts": {
    "desktop": "npm --prefix apps/desktop start",
    "sidecar": "cd services/sidecar && .venv/Scripts/python -m app.main"
  }
}
```

`apps/desktop/package.json`:

```json
{
  "name": "jarvis-desktop",
  "version": "0.1.0",
  "main": "electron/main.js",
  "scripts": {
    "start": "electron ."
  },
  "devDependencies": {
    "electron": "^33.2.0"
  },
  "dependencies": {
    "electron-store": "^10.0.0",
    "openai": "^4.73.0"
  }
}
```

- [ ] **Step 2: Implement main window with content protection**

`apps/desktop/electron/main.js` (core):

```javascript
const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');

let overlay = null;

function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  overlay = new BrowserWindow({
    width: 380,
    height: 420,
    x: width - 400,
    y: height - 460,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setContentProtection(true);
  overlay.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));
}

app.whenReady().then(() => {
  createOverlay();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
```

`apps/desktop/electron/preload.js`:

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  onState: (cb) => ipcRenderer.on('state', (_e, state) => cb(state)),
  setMode: (mode) => ipcRenderer.invoke('set-mode', mode),
  clearConversation: () => ipcRenderer.invoke('clear-conversation'),
  toggleMute: () => ipcRenderer.invoke('toggle-mute'),
  copyLast: () => ipcRenderer.invoke('copy-last'),
  hide: () => ipcRenderer.invoke('hide-overlay'),
  openSettings: () => ipcRenderer.invoke('open-settings'),
});
```

- [ ] **Step 3: Minimal overlay UI**

Dark glass panel: mode chips, status, messages list, buttons (Mute, Clear, Copy, Hide). CSS: translucent background, high-contrast text, no purple/glow clichés — charcoal glass + cool teal accent is fine if restrained.

- [ ] **Step 4: Manual verify content protection**

```bash
cd apps/desktop && npm install && npm start
```

Start OBS Window Capture or Win+G; confirm overlay is blank/missing in capture while visible on desktop.

- [ ] **Step 5: Commit**

```bash
git add package.json apps/desktop
git commit -m "feat: add capture-protected Electron overlay shell"
```

---

### Task 5: Settings, sidecar manager, and sidecar HTTP client

**Files:**
- Create: `apps/desktop/electron/settings.js`
- Create: `apps/desktop/electron/sidecar-manager.js`
- Create: `apps/desktop/electron/sidecar-client.js`
- Create: `apps/desktop/renderer/settings.html`
- Create: `apps/desktop/renderer/settings.css`
- Create: `apps/desktop/renderer/settings.js`
- Modify: `apps/desktop/electron/main.js`

**Interfaces:**
- Consumes: sidecar `/health`, `/devices`, `/listen/start`, `/listen/stop`
- Produces:
  - `settings.get()/set()` — `{ apiKey, model, whisperModel, hotkey, pressStyle, defaultMode, ttsEnabled, micDeviceId, loopbackDeviceId, sidecarPython }`
  - API key via `safeStorage.encryptString` stored in electron-store blob
  - `SidecarManager.start()/stop()/ensureHealthy()`
  - `sidecarClient.health()`, `.devices()`, `.listenStart(body)`, `.listenStop()`
  - Base URL `http://127.0.0.1:8765`

- [ ] **Step 1: Implement settings.js**

```javascript
const { safeStorage } = require('electron');
const Store = require('electron-store');

const store = new Store({ name: 'jarvis-settings' });

const DEFAULTS = {
  model: 'gpt-4o-mini',
  hotkey: 'CommandOrControl+Shift+Space',
  pressStyle: 'hold', // 'hold' | 'toggle'
  defaultMode: 'jarvis',
  ttsEnabled: true,
  micDeviceId: null,
  loopbackDeviceId: null,
  sidecarPython: '..\\..\\services\\sidecar\\.venv\\Scripts\\python.exe',
  whisperModel: 'base',
};

function getSettings() {
  const data = { ...DEFAULTS, ...store.get('prefs', {}) };
  const enc = store.get('apiKeyEnc');
  if (enc && safeStorage.isEncryptionAvailable()) {
    data.apiKey = safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } else {
    data.apiKey = process.env.OPENAI_API_KEY || '';
  }
  return data;
}

function saveSettings(partial) {
  const prefs = { ...store.get('prefs', {}), ...partial };
  if ('apiKey' in partial) {
    const key = partial.apiKey || '';
    delete prefs.apiKey;
    if (key && safeStorage.isEncryptionAvailable()) {
      store.set('apiKeyEnc', safeStorage.encryptString(key).toString('base64'));
    }
  }
  store.set('prefs', prefs);
  return getSettings();
}

module.exports = { getSettings, saveSettings, DEFAULTS };
```

- [ ] **Step 2: sidecar-client.js + sidecar-manager.js**

`sidecar-client.js`: fetch wrappers with 15s timeout on stop (Whisper can be slow — use 120s for stop).

`sidecar-manager.js`: `spawn(python, ['-m', 'app.main'], { cwd: sidecarDir, env: { ...process.env, WHISPER_MODEL } })`; poll `/health` every 2s; on exit, restart up to 5 times with backoff; expose `onStatus(cb)`.

- [ ] **Step 3: Settings window** fields for API key, model, devices (populated from `/devices`), hotkey display, press style, TTS default, Python path.

- [ ] **Step 4: On app ready** — start sidecar manager; if health fails 30s, show overlay error banner.

- [ ] **Step 5: Manual test**

Kill Python process; confirm Electron restarts it and overlay shows brief banner only if restart fails.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop
git commit -m "feat: add settings, sidecar spawn, and HTTP client"
```

---

### Task 6: Conversation, prompts, OpenAI chat turn

**Files:**
- Create: `apps/desktop/electron/prompts.js`
- Create: `apps/desktop/electron/conversation.js`
- Create: `apps/desktop/electron/openai-client.js`
- Modify: `apps/desktop/electron/main.js`
- Modify: `apps/desktop/renderer/overlay.js`

**Interfaces:**
- Consumes: transcript string from sidecar; settings.apiKey/model
- Produces:
  - `conversation.getMessages()`, `.appendUser(text)`, `.appendAssistant(text)`, `.clear()`, `.setMode(mode)`, `.getMode()`
  - `prompts.systemFor(mode)` → string
  - `openaiClient.chat({ system, messages }) -> string`
  - Full turn pipeline function `runTurn()` in main

- [ ] **Step 1: prompts.js**

```javascript
function systemFor(mode) {
  if (mode === 'interview') {
    return [
      'You are a meeting/interview copilot.',
      'The user transcript is what was just heard (often the other party).',
      'Suggest a strong, natural spoken answer or short talking points.',
      'Keep it concise and speakable.',
      'If ambiguous, give a best-guess answer and one line: Assuming they asked: ...',
    ].join(' ');
  }
  return [
    'You are Jarvis, a concise desktop assistant.',
    'You hear mic + system audio transcripts.',
    'Explain, answer, or summarize helpfully and directly.',
    'Avoid long essays unless asked.',
  ].join(' ');
}

module.exports = { systemFor };
```

- [ ] **Step 2: conversation.js**

Keep `{ role: 'user'|'assistant', content: string }[]` plus `mode`. Cap history to last 20 messages.

- [ ] **Step 3: openai-client.js**

```javascript
const OpenAI = require('openai');

function createClient(apiKey) {
  return new OpenAI({ apiKey });
}

async function chat(client, { model, system, messages }) {
  const res = await client.chat.completions.create({
    model,
    messages: [{ role: 'system', content: system }, ...messages],
    temperature: 0.5,
  });
  return res.choices[0]?.message?.content?.trim() || '';
}

module.exports = { createClient, chat };
```

- [ ] **Step 4: Wire runTurn**

Pseudo-flow in main (on listen stop):

1. status → `thinking`
2. if `!transcript.trim()` → error “Nothing heard”; status idle; return
3. append user transcript; call OpenAI; append assistant; push state
4. on OpenAI error: keep transcript in history or show error with retry invoke — show short error, keep last heard text in UI for retry button

- [ ] **Step 5: Manual test with API key** — speak a question; overlay shows reply; second hotkey turn references first.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop
git commit -m "feat: add conversation modes and OpenAI chat turns"
```

---

### Task 7: Global hotkey hold/toggle listen pipeline

**Files:**
- Modify: `apps/desktop/electron/main.js`
- Modify: `apps/desktop/renderer/overlay.js`

**Interfaces:**
- Consumes: sidecar listen start/stop; `runTurn`; settings.pressStyle / hotkey
- Produces: registered `globalShortcut`; state machine `idle | listening | thinking | speaking`

- [ ] **Step 1: Implement state machine**

```javascript
// states: idle | listening | thinking | speaking
// if status === 'thinking' && hotkey → ignore
```

Hold mode: on keydown accelerator — Electron `globalShortcut` only fires press, not release. **Workaround for v1:** treat hotkey as **toggle** always for reliability, OR use `uiohook-napi` / `keydown` native module for true hold.

**v1 decision (lock this):** implement **toggle** via `globalShortcut` as default behavior matching “press on / press off”, and still expose setting `pressStyle`. If `hold` is selected, document that v1 maps hold→toggle until native keyup is added — OR add dependency `uiohook-napi` for keydown/keyup.

**Preferred for spec fidelity:** add `uiohook-napi` for hold-to-talk:

```javascript
const { uIOhook, UiohookKey } = require('uiohook-napi');
// map Ctrl+Shift+Space keydown → start, keyup → stop
```

Install `uiohook-napi` in `apps/desktop`. Fallback: if native module fails to load, use toggle via `globalShortcut`.

- [ ] **Step 2: startListen / stopListen**

```javascript
async function startListen() {
  if (status !== 'idle') return;
  status = 'listening';
  broadcast();
  await sidecarClient.listenStart({
    mic_device_id: settings.micDeviceId,
    loopback_device_id: settings.loopbackDeviceId,
    max_seconds: 180,
  });
}

async function stopListen() {
  if (status !== 'listening') return;
  status = 'thinking';
  broadcast();
  const { text, duration_sec } = await sidecarClient.listenStop();
  await runTurn(text);
}
```

- [ ] **Step 3: Manual test** both short toggle and 180s auto-stop (can temporarily set max 5s for test).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop
git commit -m "feat: wire global hotkey listen pipeline"
```

---

### Task 8: OpenAI TTS + mute + overlay polish

**Files:**
- Create: `apps/desktop/electron/tts.js`
- Modify: `apps/desktop/electron/openai-client.js`
- Modify: `apps/desktop/electron/main.js`
- Modify: `apps/desktop/renderer/overlay.*`

**Interfaces:**
- Consumes: assistant reply string; settings.ttsEnabled / muted
- Produces: `tts.speak(text)`, `tts.stop()`, mute toggle persists for session

- [ ] **Step 1: tts.js** — call OpenAI audio speech API, write temp mp3, play via hidden `<audio>` in overlay through IPC `play-audio` with base64 data URL, or use main-process player. Simplest: renderer Audio element.

```javascript
async function synthesize(client, text, voice = 'alloy') {
  const res = await client.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice,
    input: text,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString('base64');
}
```

If `gpt-4o-mini-tts` unavailable on account, fall back to `tts-1`.

- [ ] **Step 2: After chat reply** — if not muted, status `speaking`, send audio to renderer; on `ended`, status `idle`. Mute skips TTS.

- [ ] **Step 3: Overlay** — show Heard snippet, streaming-friendly message list, Mute/Clear/Copy/Hide working; mode chips call `setMode`.

- [ ] **Step 4: Manual test** mute off/on; copy last; clear resets follow-up context.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop
git commit -m "feat: add muteable OpenAI TTS and overlay controls"
```

---

### Task 9: End-to-end hardening + README

**Files:**
- Modify: `README.md`
- Modify: error paths in `main.js` / sidecar
- Create: `apps/desktop/electron/errors.js` (optional small helpers)

**Interfaces:**
- Produces: documented run instructions; polished error strings from spec table

- [ ] **Step 1: Map errors to overlay copy**

| Case | Overlay message |
|------|-----------------|
| No devices | Pick mic/loopback in Settings |
| Whisper fail | Transcription failed — try again |
| OpenAI 401 | Invalid key invalid — open Settings |
| OpenAI rate limit | Rate limited — wait and retry |
| Sidecar down | Audio engine reconnecting… |
| Silence | Nothing heard |

- [ ] **Step 2: README** — install venv, `pip install -r requirements.txt`, set API key in Settings, `npm install` in desktop, run sidecar + `npm start`, hotkey usage, capture-protection caveat (not phone cameras).

- [ ] **Step 3: Full checklist from spec Testing section — run each item; fix blockers.

- [ ] **Step 4: Commit**

```bash
git add README.md apps/desktop services/sidecar
git commit -m "docs: add runbook and harden error handling"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Electron + Python sidecar | 1, 4, 5 |
| Hotkey PTT (hold/toggle) | 7 |
| Mic + system audio mix | 2 |
| Faster Whisper | 3 |
| OpenAI chat + history loop | 6 |
| Jarvis / Interview modes | 6 |
| Capture-protected overlay | 4 |
| Optional muteable TTS | 8 |
| Settings + safe API key | 5 |
| 180s max / silence skip | 2, 3, 7 |
| Sidecar auto-restart | 5 |
| Error handling table | 9 |
| Testing checklist | 9 |

## Self-review notes

- Locked TTS to OpenAI; locked IPC to localhost HTTP; locked 180s cap (matches spec).
- Hold-to-talk uses `uiohook-napi` with `globalShortcut` toggle fallback (Electron limitation).
- Dual-stream mic+loopback mix must be verified on target Windows hardware in Task 2.
- No TBD placeholders remain for v1 scope.
