const fs = require('fs');
const path = require('path');
const Store = require('electron-store');

const store = new Store({ name: 'jarvis-settings' });

/** Max characters stored and injected into prompts. */
const KNOWLEDGE_MAX_CHARS = 100_000;

function truncateText(text, maxChars = KNOWLEDGE_MAX_CHARS) {
  const raw = typeof text === 'string' ? text.replace(/\u0000/g, '').trim() : '';
  if (!raw) {
    return { text: '', truncated: false };
  }
  if (raw.length <= maxChars) {
    return { text: raw, truncated: false };
  }
  return { text: raw.slice(0, maxChars), truncated: true };
}

async function extractWithUnpdf(buffer) {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const result = await extractText(pdf, { mergePages: true });
  if (Array.isArray(result.text)) {
    return result.text.join('\n');
  }
  return typeof result.text === 'string' ? result.text : '';
}

async function extractPdfText(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new TypeError('PDF path is required');
  }
  const resolved = path.resolve(filePath.trim());
  if (!resolved.toLowerCase().endsWith('.pdf')) {
    throw new Error('File must be a PDF');
  }
  if (!fs.existsSync(resolved)) {
    throw new Error('PDF file not found');
  }

  const buffer = fs.readFileSync(resolved);
  let rawText = '';
  try {
    // unpdf is more tolerant than pdf-parse under Electron for real-world PDFs
    rawText = await extractWithUnpdf(buffer);
  } catch (error) {
    const detail = error?.message || String(error);
    throw new Error(`Could not read PDF text (${detail})`);
  }

  const { text, truncated } = truncateText(rawText);
  if (!text) {
    throw new Error('No readable text in this PDF (it may be scanned/image-only)');
  }

  return {
    name: path.basename(resolved),
    text,
    truncated,
    charCount: text.length,
    loadedAt: new Date().toISOString(),
  };
}

function saveKnowledge(entry) {
  if (!entry || typeof entry.text !== 'string' || !entry.text.trim()) {
    throw new TypeError('Knowledge entry requires text');
  }
  store.set('knowledge', {
    name: String(entry.name || 'document.pdf'),
    text: entry.text,
    truncated: Boolean(entry.truncated),
    charCount: entry.text.length,
    loadedAt: entry.loadedAt || new Date().toISOString(),
  });
  return getKnowledgeMeta();
}

function clearKnowledge() {
  store.delete('knowledge');
  return getKnowledgeMeta();
}

function getKnowledgeRecord() {
  const knowledge = store.get('knowledge');
  if (!knowledge || typeof knowledge !== 'object') return null;
  if (typeof knowledge.text !== 'string' || !knowledge.text.trim()) return null;
  return knowledge;
}

function getKnowledgeText() {
  return getKnowledgeRecord()?.text || '';
}

function getKnowledgeMeta() {
  const knowledge = getKnowledgeRecord();
  if (!knowledge) {
    return {
      hasKnowledgePdf: false,
      knowledgePdfName: '',
      knowledgePdfCharCount: 0,
      knowledgePdfTruncated: false,
      knowledgePdfLoadedAt: null,
    };
  }
  return {
    hasKnowledgePdf: true,
    knowledgePdfName: String(knowledge.name || 'document.pdf'),
    knowledgePdfCharCount: Number(knowledge.charCount) || knowledge.text.length,
    knowledgePdfTruncated: Boolean(knowledge.truncated),
    knowledgePdfLoadedAt: knowledge.loadedAt || null,
  };
}

module.exports = {
  KNOWLEDGE_MAX_CHARS,
  truncateText,
  extractPdfText,
  saveKnowledge,
  clearKnowledge,
  getKnowledgeText,
  getKnowledgeMeta,
  getKnowledgeRecord,
};
