const BASE_URL = 'http://127.0.0.1:8765';
const DEFAULT_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 120_000;

async function request(pathname, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BASE_URL}${pathname}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.detail || payload?.error || `HTTP ${response.status}`;
      const error = new Error(`Sidecar request failed: ${detail}`);
      error.status = response.status;
      error.detail = detail;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Sidecar request timed out after ${timeoutMs}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function health() {
  return request('/health');
}

function devices() {
  return request('/devices');
}

function listenStart(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TypeError('listenStart body must be an object');
  }
  return request('/listen/start', { method: 'POST', body });
}

function listenStop() {
  return request('/listen/stop', { method: 'POST', timeoutMs: STOP_TIMEOUT_MS });
}

module.exports = {
  BASE_URL,
  health,
  devices,
  listenStart,
  listenStop,
};
