# Jarvis Overlay

Jarvis Overlay is a Windows 10/11 Electron assistant that captures microphone
and system audio through a local Python sidecar, transcribes with Faster
Whisper, and displays OpenAI responses in a capture-protected overlay.

## Prerequisites

- Node.js 20 or newer
- Python 3.10 or newer
- A working Windows microphone and/or WASAPI loopback device
- An OpenAI API key

## Install

From PowerShell in the repository root:

```powershell
cd services\sidecar
python -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -r requirements.txt

cd ..\..\apps\desktop
npm install
```

The first Faster Whisper startup may download the selected model.

## Run

```powershell
cd apps\desktop
npm start
```

The desktop app starts and monitors the sidecar using
`services\sidecar\.venv\Scripts\python.exe`. To use another interpreter, open
Settings and change **Sidecar Python**.

Open the overlay's **Settings**, enter the OpenAI API key, choose the microphone
and loopback devices, and save. The key is encrypted with Electron
`safeStorage`; `OPENAI_API_KEY` can also provide it without saving it.

Hold `Ctrl+Shift+Space` to talk, then release to transcribe and answer. Settings
can change the hotkey or switch to toggle mode, where the first press starts
capture and the second stops it. Captures auto-stop after 180 seconds.

## Troubleshooting

- **Pick mic/loopback in Settings**: select valid audio devices and retry.
- **Audio engine reconnecting…**: verify the Sidecar Python path and venv
  dependencies. The app retries the sidecar automatically.
- **Invalid key invalid — open Settings**: replace the OpenAI API key.
- **Rate limited — wait and retry**: wait for the API limit to reset.
- **Transcription failed — try again**: retry; confirm the Whisper model can
  load locally.

## Capture-protection caveat

Electron content protection is enabled to hide or blank the overlay in common
Windows screen-sharing and recording tools. Verify it with the exact OBS,
Teams, Zoom, Discord, or Game Bar capture mode you use. It is not guaranteed
against every capture hook and cannot hide the overlay from physical or phone
cameras.

## Tests

```powershell
cd apps\desktop
npm test

cd ..\..\services\sidecar
.\.venv\Scripts\python -m pytest
```

See `docs/superpowers/specs/2026-09-15-jarvis-overlay-design.md` for the design.
