# Knowledge PDF (Approach A) — Design

**Date:** 2026-09-17  
**Status:** Approved  
**Scope:** Single PDF → local text extract → inject into all modes (Jarvis + Interview listen/chat + Screen scan)

## Goal

Let the user attach one architecture/knowledge PDF in Settings so Listen and Scan answers can use that document as ground truth when relevant.

## Non-goals

- Multiple PDFs / libraries
- RAG / embeddings / vector DB
- Uploading the PDF to OpenAI Files / Assistants
- OCR for scanned image-only PDFs (text extraction only; fail clearly if no text)
- Editing or chatting with the PDF as a separate UI

## UI (Settings)

- Section **Knowledge PDF**
- **Choose PDF** — native file picker (`*.pdf`)
- Display: filename, approximate character count (or “truncated”), last loaded time
- **Clear** — removes knowledge from AppData
- Errors: unreadable PDF, empty text, too large before extract (optional soft warn)

## Storage

- Location: Electron userData / existing settings store (AppData), **not** git
- Fields (conceptual):
  - `knowledgePdfName` (string)
  - `knowledgePdfText` (string, extracted)
  - `knowledgePdfTruncated` (boolean)
  - `knowledgePdfLoadedAt` (ISO string or epoch)
- Clearing deletes these fields
- API key handling unchanged

## Extraction

- Main process (or dedicated module) after file choose
- Library: local PDF text extract (e.g. `pdf-parse` or equivalent maintained package)
- Cap injected/stored text at **~100,000 characters**; if longer, keep prefix and set `knowledgePdfTruncated: true`
- Reject / error if extracted text is empty after trim

## Runtime use

- Helper: `knowledgeContext(settings)` → string or empty
- **Listen / chat** (`systemFor` path): if knowledge present, append a fixed Knowledge block to the system prompt, e.g. instruct model to treat it as the candidate’s app/architecture ground truth when relevant; do not invent contradictions; if unused, ignore silently
- **Screen scan** (`systemForScreenScan` path): same Knowledge block appended
- No PDF → identical behavior to today

## Privacy

- PDF text stays on disk in AppData until cleared
- When knowledge is loaded, extracted text is included in OpenAI request payloads for chat and scan (same data-control caveats as transcripts)
- Document briefly in README Settings / Privacy

## Success criteria

1. User can choose one PDF in Settings and see filename/status  
2. Jarvis and Interview spoken turns can reference architecture details from the PDF  
3. Screen scan can use the same knowledge when relevant  
4. Clear removes knowledge; subsequent turns do not include it  
5. Oversized PDFs truncate with UI indication; empty/unreadable PDFs show an error  

## Spec self-review

- Matches approved Approach A (single PDF, all modes, local extract, prompt inject).
- Cap and empty-PDF errors covered.
- No OpenAI Files upload.
