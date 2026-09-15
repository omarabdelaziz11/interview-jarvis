# Task 7 Report: Global hotkey hold/toggle listen pipeline

## Status

DONE

## Implementation

- Added `uiohook-napi` hold-to-talk handling with keydown start and keyup stop.
- Added a complete Electron `globalShortcut` toggle fallback for native load failures, unsupported native accelerators, and the explicit toggle setting.
- Added guarded listen state transitions, ignored hotkeys while thinking/speaking, and enforced a 180-second stop timer.
- Passed configured microphone and loopback device IDs with `max_seconds: 180` to the sidecar.
- Wired listen stop transcription into `runTurn`.
- Re-registers the hotkey when hotkey or press style settings change and cleans registrations up during shutdown.
- Added overlay retry for failed turns using retained heard text without starting another listen or duplicating the user message.

## Commit

- `e129368 feat: wire global hotkey listen pipeline`

## Verification

- `npm test`: 13 tests passed.
- `node --check` passed for all changed JavaScript files.
- `git diff --check` passed.
- `uiohook-napi` loaded under Electron 44.3.0 without an Electron rebuild.
- Electron app remained running through a five-second startup smoke test.

## Concerns

- A physical global-hotkey/microphone test and a full 180-second recording were not practical in the automated session. The native module load, app startup, timeout wiring, and fallback path were verified.

## Fix pass (review)

- Gated retry with `lastTurnFailed` — only set on `runTurn` chat failure; cleared on success and new listen. Retry hidden for sidecar/hotkey errors.
- Retry skips duplicate `appendUser` when the last history entry already matches the heard text.
- Documented that Task 8 owns `speaking`/TTS; successful chat stays `idle` until then.
- Extracted `listen-pipeline.js` with unit tests: thinking ignores startListen, device IDs forwarded, pending-start release helper.

## Fix commit

- `fix: gate turn retry and add listen pipeline tests`
