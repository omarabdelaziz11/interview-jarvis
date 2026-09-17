# Knowledge PDF — Implementation Plan

**Date:** 2026-09-17  
**Spec:** `docs/superpowers/specs/2026-09-17-knowledge-pdf-design.md`

## Files

| File | Role |
|------|------|
| `apps/desktop/electron/knowledge.js` | Extract PDF text, cap length, store/load/clear in electron-store |
| `apps/desktop/electron/prompts.js` | `withKnowledge(system, text)` helper |
| `apps/desktop/electron/main.js` | dialog pick PDF, IPC load/clear, inject knowledge in chat + scan |
| `apps/desktop/electron/preload.js` | expose `pickKnowledgePdf` / `clearKnowledgePdf` |
| `apps/desktop/electron/public-settings.js` | expose knowledge metadata (no full text to renderer if large — or truncated preview) |
| `apps/desktop/renderer/settings.html/js/css` | Knowledge PDF UI |
| `apps/desktop/package.json` | add `pdf-parse` |
| `README.md` | document feature |

## Tasks

1. Add `knowledge.js` + unit test for truncate/join system prompt  
2. Wire IPC + dialog in main; inject into `runTurn` and `scanPrimaryScreen`  
3. Settings UI + preload  
4. README + smoke tests  

## Done when

Choose PDF in Settings → Listen/Scan can use architecture details; Clear removes it.
