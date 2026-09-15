# Listen + Screen Scan Buttons — Design

**Date:** 2026-09-15  
**Status:** Approved  
**Approach:** Electron `desktopCapturer` + OpenAI vision (`gpt-4o-mini`)

## Goal

Add overlay controls:

1. **Listen** — same behavior as the global hotkey (arm/disarm continuous listen, or hold/toggle per settings).
2. **Scan screen** — Interview mode only; one click captures the **primary monitor** (no picker/dialogs) and answers visible questions in the overlay with a direct spoken-style answer.

## Non-goals

- Window/region picker dialogs
- TTS (remains disabled)
- Multi-monitor picker UI (always primary display)
- Local OCR pipeline

## UI

- Footer: **Listen** button (all modes). Label reflects state: `Listen` when idle/off, `Stop` (or `Listening…`) when session armed.
- Footer: **Scan screen** button — rendered only when `mode === 'interview'`.
- Grid adjusts to button count (Listen + Clear + Copy + Settings + Hide; + Scan in interview).

## Listen button

- Invokes the same handler as the configured hotkey (`toggleContinuousSession` / hold / one-shot toggle).
- No new audio logic.

## Scan screen flow

1. User clicks **Scan screen** (Interview only).
2. Overlay status → `thinking`.
3. Main process captures primary screen via `desktopCapturer` (or equivalent), JPEG/PNG as base64.
4. OpenAI chat with vision (`detail: high`): system prompt finds interview questions anywhere on screen (including TOC/sidebar lists); answers all visible questions with matching numbers.
5. Append user turn as `[Screen scan]` + assistant answer to conversation; show in overlay.
6. Status → `idle`. Errors show existing error row.

## Privacy / capture

- Overlay keeps `setContentProtection(true)` — may appear blank in the capture (desired).
- Image is sent to OpenAI for that request; same data-controls caveats as chat.

## Success criteria

- Listen button matches hotkey behavior.
- Scan screen appears only in Interview; one click → answer in overlay with no dialogs.
- Primary monitor only.
