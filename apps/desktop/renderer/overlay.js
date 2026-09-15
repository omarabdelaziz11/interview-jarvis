const overlayElement = document.querySelector('.overlay');
const statusText = document.querySelector('#status-text');
const heardElement = document.querySelector('#heard');
const heardText = document.querySelector('#heard-text');
const messagesElement = document.querySelector('#messages');
const emptyState = document.querySelector('#empty-state');
const errorRow = document.querySelector('#error-row');
const errorElement = document.querySelector('#error');
const retryButton = document.querySelector('#retry-button');
const muteButton = document.querySelector('#mute-button');
const copyButton = document.querySelector('#copy-button');
const modeButtons = [...document.querySelectorAll('[data-mode]')];

const STATUS_LABELS = {
  idle: 'Idle',
  listening: 'Listening',
  transcribing: 'Transcribing',
  thinking: 'Thinking',
  speaking: 'Speaking',
  error: 'Needs attention',
};

function safeText(value) {
  return typeof value === 'string' ? value : '';
}

function renderMessages(messages) {
  const validMessages = Array.isArray(messages)
    ? messages.filter(
        (message) =>
          message &&
          (message.role === 'user' || message.role === 'assistant') &&
          typeof message.content === 'string',
      )
    : [];

  messagesElement.replaceChildren();
  if (validMessages.length === 0) {
    messagesElement.append(emptyState);
    copyButton.disabled = true;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const message of validMessages) {
    const article = document.createElement('article');
    const role = document.createElement('span');
    const content = document.createElement('p');

    article.className = 'message';
    article.dataset.role = message.role;
    role.className = 'message-role';
    role.textContent = message.role === 'assistant' ? 'Jarvis' : 'You';
    content.textContent = message.content;
    article.append(role, content);
    fragment.append(article);
  }

  messagesElement.append(fragment);
  messagesElement.scrollTop = messagesElement.scrollHeight;
  copyButton.disabled = false;
}

function renderState(state) {
  if (!state || typeof state !== 'object') return;

  const status = safeText(state.status) || 'idle';
  overlayElement.dataset.status = status;
  statusText.textContent = STATUS_LABELS[status] || status;

  const heard = safeText(state.heard);
  heardText.textContent = heard;
  heardElement.hidden = !heard;

  const error = safeText(state.error);
  errorElement.textContent = error;
  errorRow.hidden = !error;
  retryButton.hidden = !(error && heard);

  muteButton.textContent = state.muted ? 'Unmute' : 'Mute';
  muteButton.setAttribute('aria-pressed', String(Boolean(state.muted)));

  for (const button of modeButtons) {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }

  renderMessages(state.messages);
}

async function invoke(action) {
  try {
    await action();
  } catch {
    errorElement.textContent = 'The action could not be completed.';
    errorRow.hidden = false;
  }
}

for (const button of modeButtons) {
  button.addEventListener('click', () => invoke(() => window.jarvis.setMode(button.dataset.mode)));
}

muteButton.addEventListener('click', () => invoke(window.jarvis.toggleMute));
document
  .querySelector('#clear-button')
  .addEventListener('click', () => invoke(window.jarvis.clearConversation));
copyButton.addEventListener('click', () => invoke(window.jarvis.copyLast));
retryButton.addEventListener('click', () => invoke(window.jarvis.retryTurn));
document
  .querySelector('#settings-button')
  .addEventListener('click', () => invoke(window.jarvis.openSettings));
document.querySelector('#hide-button').addEventListener('click', () => invoke(window.jarvis.hide));

window.jarvis.onState(renderState);
