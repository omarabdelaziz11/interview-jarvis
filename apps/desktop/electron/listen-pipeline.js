const MAX_LISTEN_SECONDS = 180;

function canStartListen(status) {
  return status === 'idle' || status === 'error';
}

function buildListenStartBody(settings, maxSeconds = MAX_LISTEN_SECONDS) {
  return {
    mic_device_id: settings.micDeviceId,
    loopback_device_id: settings.loopbackDeviceId,
    max_seconds: maxSeconds,
  };
}

function releasePendingListenStart(current, completed) {
  return current === completed ? null : current;
}

function createListenHandlers(state, deps) {
  const {
    sidecarClient,
    getSettings,
    sendState,
    showSidecarError,
    runTurn,
    maxSeconds = MAX_LISTEN_SECONDS,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
  } = deps;

  let listenStartRequest = null;
  let listenTimeout = null;

  function clearListenTimeout() {
    if (listenTimeout) {
      clearTimeoutFn(listenTimeout);
      listenTimeout = null;
    }
  }

  async function startListen() {
    if (!canStartListen(state.status)) return;

    clearListenTimeout();
    state.status = 'listening';
    state.error = null;
    state.heard = null;
    state.lastTurnFailed = false;
    sendState();

    const settings = getSettings();
    const request = sidecarClient.listenStart(buildListenStartBody(settings, maxSeconds));
    listenStartRequest = request;

    try {
      await request;
      if (state.status === 'listening') {
        listenTimeout = setTimeoutFn(() => void stopListen(), maxSeconds * 1000);
      }
    } catch {
      showSidecarError('Could not start listening. Check the local audio service.');
    } finally {
      listenStartRequest = releasePendingListenStart(listenStartRequest, request);
    }
  }

  async function stopListen() {
    if (state.status !== 'listening') return;

    state.status = 'thinking';
    state.error = null;
    clearListenTimeout();
    sendState();

    try {
      if (listenStartRequest) await listenStartRequest;
      const result = await sidecarClient.listenStop();
      await runTurn(result?.text);
    } catch {
      showSidecarError('Could not stop listening. Check the local audio service.');
    }
  }

  function toggleListen() {
    if (state.status === 'listening') {
      void stopListen();
    } else if (canStartListen(state.status)) {
      void startListen();
    }
  }

  return { startListen, stopListen, toggleListen, clearListenTimeout };
}

module.exports = {
  MAX_LISTEN_SECONDS,
  canStartListen,
  buildListenStartBody,
  releasePendingListenStart,
  createListenHandlers,
};
