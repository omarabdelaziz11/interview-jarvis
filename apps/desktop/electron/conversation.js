const MAX_MESSAGES = 20;
const MODES = new Set(['jarvis', 'interview']);

let messages = [];
let mode = 'jarvis';

function normalizeContent(content) {
  if (typeof content !== 'string' || !content.trim()) {
    throw new TypeError('Message content must be a non-empty string');
  }
  return content.trim();
}

function append(role, content) {
  messages.push({ role, content: normalizeContent(content) });
  if (messages.length > MAX_MESSAGES) {
    messages = messages.slice(-MAX_MESSAGES);
  }
}

function getMessages() {
  return messages.map((message) => ({ ...message }));
}

function appendUser(content) {
  append('user', content);
}

function appendAssistant(content) {
  append('assistant', content);
}

function clear() {
  messages = [];
}

function setMode(nextMode) {
  if (!MODES.has(nextMode)) {
    throw new TypeError('Invalid conversation mode');
  }
  mode = nextMode;
}

function getMode() {
  return mode;
}

module.exports = {
  MAX_MESSAGES,
  getMessages,
  appendUser,
  appendAssistant,
  clear,
  setMode,
  getMode,
};
