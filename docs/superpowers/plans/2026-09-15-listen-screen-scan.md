# Listen + Screen Scan — Implementation Plan

**Date:** 2026-09-15  
**Spec:** `docs/superpowers/specs/2026-09-15-listen-screen-scan-design.md`

## Steps

1. `screen-capture.js` — primary display PNG via `desktopCapturer` (no picker).
2. `openai-client.chatWithImage` — vision user message with image data URL.
3. `prompts.systemForScreenScan` — interview-style direct answers from screenshot.
4. Main: `activateListenControl`, `scanPrimaryScreen`, IPC `toggle-listen` / `scan-screen`, `listeningArmed` in state.
5. Preload + overlay: Listen (all modes) + Scan screen (Interview only).

## Done when

- Listen mirrors hotkey press-style behavior.
- Scan screen one-click primary monitor → answer in overlay, Interview only.
