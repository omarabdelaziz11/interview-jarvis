# Interview Jarvis

Windows desktop overlay assistant that listens to your mic and/or system audio, transcribes with local **Faster Whisper**, and shows **OpenAI** answers in a capture-protected floating window.

Two modes:

- **Jarvis** — general assistant (mic + optional system audio)
- **Interview** — system-audio only (meetings/videos); replies with a direct spoken answer you can use

> **Privacy:** Your OpenAI API key is stored on your machine in Windows AppData (encrypted), not in this repository.

## Requirements

- Windows 10/11
- [Node.js](https://nodejs.org/) 20+ (22+ recommended)
- [Python](https://www.python.org/) 3.10+
- An [OpenAI API key](https://platform.openai.com/api-keys)
- Speakers/headphones with a WASAPI loopback device (for Interview / system audio)

## Quick start

From PowerShell in the repo root:

### 1. Python sidecar (audio + Whisper)

```powershell
cd services\sidecar
python -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -r requirements.txt
cd ..\..
```

The first run downloads the Whisper model (default: `small`, English).

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
5. Optional: hotkey, press style, Whisper model (`small` recommended)

The API key is encrypted with Electron `safeStorage` (Windows DPAPI) under your user profile. You can also set `OPENAI_API_KEY` in the environment instead of saving it in Settings.

## How to use

| Action | Default |
|--------|---------|
| Hotkey | `Ctrl+Shift+Space` (changeable in Settings) |
| Press style | **Always listen** — press once to arm, pause after speech to get a reply, press again to disarm |
| Hold / one-shot | Available under **Press style** in Settings |

**Jarvis mode:** hears mic (and system audio if configured).  
**Interview mode:** mic is forced off; only system/loopback audio is captured. Answers are plain text you can speak (TTS is disabled in this build).

## Project layout

```
apps/desktop/          Electron overlay + settings
services/sidecar/      FastAPI audio capture + Faster Whisper
docs/superpowers/      Design notes / implementation plan
```

## Troubleshooting

| Message | What to do |
|---------|------------|
| Pick System audio (Speakers Loopback) in Settings | Choose a `… [Loopback]` device; needed for Interview |
| Pick mic/loopback in Settings | Select working devices; prefer WASAPI/loopback over Stereo Mix when possible |
| Audio engine reconnecting… | Check **Sidecar Python** path and that the venv has dependencies installed |
| Invalid key — open Settings | Fix/replace the API key |
| Rate limited — wait and retry | Wait; check OpenAI usage/limits |
| Transcription failed — try again | Retry; confirm Whisper model downloads; try `small` |
| Nothing heard | Speak/play audio; pause briefly so endpointing can finish; check the correct output device for loopback |

## Capture protection

The overlay uses Electron `setContentProtection` so it is usually blank/hidden in Zoom, Teams, Discord, OBS, Game Bar, etc. Always verify with your capture tool. It cannot hide the overlay from a phone camera or every exotic capture path.

## Privacy & secrets

- **Not in git:** API keys, AppData settings, `.venv`, `node_modules`, `.env`, local audio dumps  
- **In AppData (local only):** `%APPDATA%\jarvis-desktop\jarvis-settings.json` (encrypted key + preferences)  
- Audio transcripts are sent to OpenAI when you use chat features — review OpenAI’s data controls if that matters for your use case  

## Development tests

```powershell
cd apps\desktop
npm test

cd ..\..\services\sidecar
.\.venv\Scripts\python -m pytest
```

## License

Add a license of your choice before publishing if you need one.
