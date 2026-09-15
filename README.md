# Interview Jarvis

Windows desktop overlay assistant that listens to your mic and/or system audio, transcribes with local **Faster Whisper**, and shows **OpenAI** answers in a capture-protected floating window.

Two modes:

- **Jarvis** — general assistant (mic + optional system audio)
- **Interview** — system-audio only (meetings/videos); replies with a direct spoken answer you can use. Includes **Scan screen** for on-screen interview questions.

> **Privacy:** Your OpenAI API key is stored on your machine in Windows AppData (encrypted), not in this repository.

## Requirements

- Windows 10/11
- [Node.js](https://nodejs.org/) 20+ (22+ recommended)
- [Python](https://www.python.org/) 3.10+
- An [OpenAI API key](https://platform.openai.com/api-keys)
- Speakers/headphones with a WASAPI loopback device (for Interview / system audio)

## Quick start


### 1. Python sidecar (audio + Whisper)

```powershell
cd services\sidecar
python -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -r requirements.txt
cd ..\..
```

For running sidecar tests, also install:

```powershell
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
```

The first listen downloads the Whisper model (default: `small` ≈ 465 MB, English). Prefer `tiny` / `base` in Settings if you want a smaller download.

### 2. Desktop app

```powershell
cd apps\desktop
npm install
npm start
```

`npm start` launches Electron and starts/supervises the Python sidecar automatically (default path: `services\sidecar\.venv\Scripts\python.exe`).

### 3. Configure

1. Open **Settings** in the overlay  
2. Paste your **OpenAI API key** → Save  
3. Set **Microphone** (Jarvis mode)  
4. Set **System audio** to a `… [Loopback]` device (required for Interview)  
5. Optional: hotkey, press style, Whisper model (`small` recommended), chat model

The API key is encrypted with Electron `safeStorage` (Windows DPAPI) under your user profile. You can also set `OPENAI_API_KEY` in the environment instead of saving it in Settings.

## Overlay controls

### Mode chips (header)

| Control | What it does |
|---------|----------------|
| **Jarvis** | General assistant mode. Captures mic (and system audio if configured). |
| **Interview** | Interview mode. Mic is forced off; only system/loopback audio is captured. Answers are plain text you can speak. Shows the **Scan screen** button. |

### Footer buttons

| Button | Modes | What it does |
|--------|-------|----------------|
| **Listen** / **Listening** | All | Same as the global hotkey. Arms or disarms continuous listening (or follows Settings **Press style**: always-listen, hold, or one-shot toggle). Label shows **Listening** while a session is armed. |
| **Scan screen** | Interview only | Captures primary monitor (≤1400px JPEG), sends to `gpt-4o` with vision `detail: high` (**~1k image tokens**, not ~35k on mini). Reads sidebar question lists without zoom; numbered lists get numbered answers. |
| **Clear** | All | Clears the conversation history in the overlay. |
| **Copy** | All | Copies the last assistant reply to the clipboard. |
| **Settings** | All | Opens the settings window (API key, devices, hotkey, models, sidecar Python path). |
| **Hide** | All | Hides the overlay window (bring it back with the hotkey). |
| **×** (top right) | All | Quits the app completely (stops Electron + sidecar), same as closing the terminal with Ctrl+C. |
| **Retry** | When shown | Re-runs the last failed turn using the last heard transcript. |

TTS / **Mute** are disabled in this build (text-only replies).

## How to use (hotkey)

| Action | Default |
|--------|---------|
| Hotkey | `Ctrl+Shift+Space` (changeable in Settings) |
| Press style | **Always listen** — press once (or **Listen**) to arm, pause after speech to get a reply, press again to disarm |
| Hold / one-shot | Available under **Press style** in Settings |

**Jarvis mode:** hears mic (and system audio if configured).  
**Interview mode:** mic off; system/loopback only. Use **Listen** for spoken questions and **Scan screen** for on-screen question lists.

## Project layout

```
apps/desktop/          Electron overlay + settings
services/sidecar/      FastAPI audio capture + Faster Whisper
docs/superpowers/      Design notes / implementation plans
```

## Size notes

Approximate local footprint (not checked into git):

| Piece | Typical size |
|-------|----------------|
| Electron (`node_modules`) | ~370 MB |
| Sidecar `.venv` | ~300 MB |
| Whisper `small` model cache | ~465 MB (`tiny` ≈ 75 MB) |

Whisper models are capped to `tiny` / `base` / `small` in Settings to avoid accidental multi‑GB downloads. Runtime sidecar deps exclude pytest/httpx extras (`requirements-dev.txt` for tests only).
## Troubleshooting

| Message | What to do |
|---------|------------|
| Pick System audio (Speakers Loopback) in Settings | Choose a `… [Loopback]` device; needed for Interview |
| Pick mic/loopback in Settings | Select working devices; prefer WASAPI/loopback over Stereo Mix when possible |
| Audio engine reconnecting… | Check **Sidecar Python** path and that the venv has `requirements.txt` installed; restart the app |
| Invalid key — open Settings | Fix/replace the API key |
| Rate limited — wait and retry | Wait; check OpenAI usage/limits |
| Transcription failed — try again | Retry; confirm Whisper model downloads; try `small` |
| Nothing heard | Speak/play audio; pause briefly so endpointing can finish; check the correct output device for loopback |
| Scan says no clear question | Ensure questions are visible on the **primary** monitor; try again after scrolling the list into view |


## Privacy & secrets

- **Not in git:** API keys, AppData settings, `.venv`, `node_modules`, `.env`, local audio dumps, `.worktrees/`  
- **In AppData (local only):** `%APPDATA%\jarvis-desktop\jarvis-settings.json` (encrypted key + preferences)  
- Audio transcripts and screen-scan images are sent to OpenAI when you use those features  

## Development tests

```powershell
cd apps\desktop
npm test

cd ..\..\services\sidecar
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python -m pytest
```
