# Jarvis Overlay Agent — Design Spec

**Date:** 2026-09-15  
**Status:** Approved for planning  
**Platform:** Windows 10/11  
**Stack:** Electron overlay + Python audio/STT sidecar + OpenAI chat/TTS

## Goal

A desktop “Jarvis” assistant that, on a hotkey, listens to **microphone + system audio**, transcribes with **local Faster Whisper**, replies via **OpenAI**, and shows the answer in an **always-on-top overlay** that is **excluded from screen share and most screen recording**. Conversation history stays in the loop across hotkey turns. Two modes: general Jarvis and interview/meeting helper.

## Non-goals (v1)

- Always-on listening / wake word / rolling audio buffer
- Fully local LLM inference
- Mobile or macOS/Linux support
- Guaranteed invisibility to phone cameras or exotic capture hooks
- Click-through overlay (idle click-through may come later)

## Architecture

```
[Global hotkey] → Electron main process
                      │
                      ├─ Capture-protected overlay window
                      ├─ Manage conversation + mode + settings
                      └─ IPC to Python sidecar (start/stop listen)

Python sidecar
  mic + WASAPI loopback → mix → Faster Whisper → transcript JSON

Electron
  transcript + history + mode → OpenAI Chat → reply
                      │
                      ├─ Overlay (stream/show text)
                      └─ Optional TTS (muteable)
```

### Components

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| Electron main | Hotkeys, window lifecycle, content protection, spawn/restart sidecar, OpenAI calls, settings storage | Electron, OpenAI API, sidecar HTTP/stdio |
| Overlay renderer | UI: status, transcript snippet, replies, mode switch, controls | Electron IPC |
| Python sidecar | Device capture, mix, Faster Whisper, return transcript | sounddevice/WASAPI, faster-whisper |
| Conversation store | In-memory session history (clearable); optional persist later | Main process only |
| Settings | API key, Whisper path, hotkey, mode default, TTS, devices, overlay position | safeStorage / local config |

## Hotkey & listen flow

1. User holds default hotkey `Ctrl+Shift+Space` (configurable), or uses optional **toggle** mode (press on / press off).
2. Overlay shows **Listening…** (still capture-protected).
3. Sidecar records **mic + system loopback** until release / second press.
4. On stop: Whisper transcribes → overlay may show short “Heard: …” → OpenAI generates reply using active mode + history.
5. Reply appears on overlay; optional TTS speaks the same text if unmuted.
6. Transcript + reply append to session history so the next hotkey turn stays in context.

### Press styles

- **Hold-to-talk** (default): short bursts in meetings.
- **Toggle** (setting): longer captures (videos, lectures).

### Conversation controls

- Mode switch (Jarvis ↔ Interview) keeps history; subsequent turns use the new system prompt.
- Clear conversation resets the loop.
- Soft max capture length: **180 seconds**; auto-stop and process.

### Concurrency (v1)

- If user hits hotkey while **Thinking**, ignore (no queue).

## Overlay UI

- Always-on-top, translucent corner panel (default bottom-right), draggable.
- Compact when idle; expands for new replies.
- **Always** `BrowserWindow.setContentProtection(true)` (Windows exclude-from-capture).
- Contents:
  - Mode chip: Jarvis | Interview
  - Status: Idle / Listening / Thinking / Speaking
  - Latest reply + short scrollable history
  - Controls: mute TTS, clear chat, copy last reply, hide panel
- Optional auto-collapse to thin edge tab when idle; hotkey or hover expands.
- Visual direction: dark glass, high-contrast text, minimal chrome — glanceable, not a dashboard.
- Do not steal focus from meeting apps when avoidable; v1 is normally clickable (not click-through).

### Capture exclusion

- Primary mechanism: Electron `setContentProtection(true)` → Win32 display affinity exclude-from-capture.
- Expected: hidden/blank in Zoom/Teams share, Discord, OBS-style capture, Game Bar for most users.
- Not guaranteed against physical cameras or niche hooks. Document this in-app once.

## Modes & AI behavior

### Shared

- Provider: OpenAI Chat Completions (model name configurable in settings).
- Each turn: system prompt for active mode + recent conversation + new transcript.
- Overlay shows concise text; TTS (if on) reads the same string.

### Jarvis mode

- General assistant: explain what was heard, answer questions, summarize media, brainstorm.
- Tone: helpful and direct; avoid long essays unless asked.

### Interview / meeting mode

- Treat captured audio as the other party (question or discussion).
- Suggest a strong spoken answer or short talking points.
- Prefer natural, speakable phrasing.
- If transcript is ambiguous: best-guess answer + one-line “assuming they asked X”.

## Audio & STT

- Capture: Windows mic + system loopback (WASAPI), mixed in the sidecar.
- STT: user’s existing **Faster Whisper** install (path/command configurable).
- Device picker in settings when multiple devices exist.
- Empty/silence after capture → show “Nothing heard”; **do not** call OpenAI.

## TTS

- Optional; default **on**, with easy mute in overlay.
- Same text as overlay reply.
- v1 implementation: **OpenAI TTS** (same API key); must be fully muteable and cancelable mid-speech.

## Configuration & secrets

- OpenAI API key in Electron `safeStorage` or env — never logged, never left permanently visible in UI.
- Settings: Whisper executable/module path, hotkey, default mode, TTS on/off, audio devices, overlay position, OpenAI model.
- Local config file for non-secret preferences.

## Error handling

| Failure | Behavior |
|---------|----------|
| No mic / no loopback | Overlay message to pick devices |
| Whisper error/timeout | Retry once, then show error |
| OpenAI error / bad key / rate limit | Short error; keep transcript; allow retry |
| Sidecar crash | Electron restarts sidecar; banner if it won’t stay up |

## Testing (v1)

- Hotkey → listen → transcript → reply on overlay
- Mic-only, system-only, then mixed smoke tests
- Overlay excluded from Game Bar / OBS / test screen share
- Mode switch changes reply style
- TTS mute; clear conversation
- Kill Python sidecar → auto-restart path

## Project layout (proposed)

```
/
  apps/desktop/          # Electron
  services/sidecar/      # Python listen + Whisper
  docs/superpowers/specs/
  docs/superpowers/plans/
```

Exact package manager to be fixed in the implementation plan. Sidecar IPC: **localhost HTTP** (JSON) so Electron can health-check and restart cleanly.

## Success criteria

1. On hotkey, user can capture mixed audio and get an on-screen reply within a few seconds of speech ending (network/model permitting).
2. Conversation context carries across turns until cleared.
3. Jarvis vs Interview modes produce appropriately different replies.
4. Overlay remains visible to the user but excluded from typical Windows screen share/record.
5. TTS can be muted; API key is not stored in plain UI state.
