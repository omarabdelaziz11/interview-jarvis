const MAX_LISTEN_SECONDS = 180;
/** Pause before treating speech as finished (was 0.9–1.2s; too eager on natural hesitations). */
const JARVIS_SILENCE_MS = 2200;
const INTERVIEW_SILENCE_MS = 2200;
/**
 * After a long silence endpoint, wait this long for speech to resume.
 * If it does, keep listening and append to the same unanswered turn.
 */
const CONTINUATION_PROBE_MS = 1500;

const { sidecarErrorMessage, OVERLAY_ERRORS } = require('./errors');

function canStartListen(status) {
  return status === 'idle' || status === 'error';
}

function isWasapiLoopbackId(id) {
  return typeof id === 'string' && id.startsWith('pyaudio:');
}

function joinTranscript(existing, next) {
  const left = typeof existing === 'string' ? existing.trim() : '';
  const right = typeof next === 'string' ? next.trim() : '';
  if (!left) return right;
  if (!right) return left;
  return `${left} ${right}`;
}

async function resolveInterviewLoopbackId(settings, sidecarClient) {
  const selected = settings.loopbackDeviceId;
  if (isWasapiLoopbackId(selected)) return selected;

  try {
    const response = await sidecarClient.devices();
    const devices = Array.isArray(response?.devices) ? response.devices : [];
    const wasapiLoopbacks = devices.filter(
      (device) => device?.kind === 'loopback' && isWasapiLoopbackId(device.id),
    );
    if (wasapiLoopbacks.length === 0) {
      return selected ?? null;
    }

    const preferred =
      wasapiLoopbacks.find((device) => /speakers/i.test(device.name)) ||
      wasapiLoopbacks.find((device) => /headphones/i.test(device.name)) ||
      wasapiLoopbacks[0];
    return preferred.id;
  } catch {
    return selected ?? null;
  }
}

function buildListenStartBody(settings, options = {}) {
  const {
    maxSeconds = MAX_LISTEN_SECONDS,
    endpointing = false,
    mode = 'jarvis',
    loopbackDeviceId = settings.loopbackDeviceId,
  } = options;
  const interview = mode === 'interview';
  return {
    // Interview: system audio only — never open the microphone.
    mic_device_id: interview ? 'off' : settings.micDeviceId,
    loopback_device_id: interview ? loopbackDeviceId : settings.loopbackDeviceId,
    max_seconds: maxSeconds,
    endpointing: Boolean(endpointing),
    silence_ms: interview ? INTERVIEW_SILENCE_MS : JARVIS_SILENCE_MS,
    min_speech_ms: interview ? 350 : 250,
  };
}

function releasePendingListenStart(current, completed) {
  return current === completed ? null : current;
}

function createListenHandlers(state, deps) {
  const {
    sidecarClient,
    getSettings,
    getMode = () => 'jarvis',
    sendState,
    showSidecarError,
    runTurn,
    maxSeconds = MAX_LISTEN_SECONDS,
    continuationProbeMs = CONTINUATION_PROBE_MS,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    sleepFn = (ms) => new Promise((resolve) => setTimeoutFn(resolve, ms)),
  } = deps;

  let listenStartRequest = null;
  let listenTimeout = null;
  let sessionActive = false;
  let sessionGeneration = 0;

  function clearListenTimeout() {
    if (listenTimeout) {
      clearTimeoutFn(listenTimeout);
      listenTimeout = null;
    }
  }

  function isSessionCurrent(generation) {
    return sessionActive && generation === sessionGeneration;
  }

  async function startListen({ endpointing = false, clearHeard = true } = {}) {
    if (!canStartListen(state.status) && !endpointing) return;
    if (endpointing && state.status === 'thinking') return;

    clearListenTimeout();
    state.status = 'listening';
    state.error = null;
    if (clearHeard) state.heard = null;
    state.lastTurnFailed = false;
    sendState();

    const settings = getSettings();
    const mode = getMode();
    let loopbackDeviceId = settings.loopbackDeviceId;

    if (mode === 'interview') {
      loopbackDeviceId = await resolveInterviewLoopbackId(settings, sidecarClient);
      if (loopbackDeviceId == null || loopbackDeviceId === '') {
        showSidecarError(OVERLAY_ERRORS.noSystemAudio);
        throw new Error(OVERLAY_ERRORS.noSystemAudio);
      }
    }

    const request = sidecarClient.listenStart(
      buildListenStartBody(settings, {
        maxSeconds,
        endpointing,
        mode,
        loopbackDeviceId,
      }),
    );
    listenStartRequest = request;

    try {
      await request;
      if (state.status === 'listening' && !endpointing) {
        listenTimeout = setTimeoutFn(() => void stopListen(), maxSeconds * 1000);
      }
    } catch (error) {
      showSidecarError(
        mode === 'interview'
          ? OVERLAY_ERRORS.noSystemAudio
          : sidecarErrorMessage(error, 'start'),
      );
      throw error;
    } finally {
      listenStartRequest = releasePendingListenStart(listenStartRequest, request);
    }
  }

  async function stopListen({ skipTurn = false } = {}) {
    if (state.status !== 'listening' && !skipTurn) return;

    if (!skipTurn) {
      state.status = 'thinking';
      state.error = null;
      sendState();
    }
    clearListenTimeout();

    try {
      if (listenStartRequest) await listenStartRequest;
      const result = await sidecarClient.listenStop();
      if (skipTurn) return result;
      await runTurn(result?.text);
      return result;
    } catch (error) {
      if (!skipTurn) showSidecarError(sidecarErrorMessage(error, 'stop'));
      throw error;
    }
  }

  async function waitForUtterance(generation) {
    while (isSessionCurrent(generation)) {
      let status;
      try {
        status = await sidecarClient.listenStatus();
      } catch {
        await sleepFn(200);
        continue;
      }
      if (!status?.recording || status.utterance_complete) {
        return;
      }
      await sleepFn(150);
    }
  }

  /**
   * After an endpoint silence, briefly listen for speech to resume.
   * @returns {'resumed'|'done'|'ended'}
   */
  async function probeForContinuation(generation) {
    await startListen({ endpointing: true, clearHeard: false });
    if (!isSessionCurrent(generation)) {
      try {
        await stopListen({ skipTurn: true });
      } catch {
        /* ignore */
      }
      return 'ended';
    }

    const deadline = Date.now() + continuationProbeMs;
    while (isSessionCurrent(generation) && Date.now() < deadline) {
      let status;
      try {
        status = await sidecarClient.listenStatus();
      } catch {
        await sleepFn(100);
        continue;
      }

      if (!status?.recording) {
        return 'done';
      }
      if (status.speech_detected) {
        await waitForUtterance(generation);
        return isSessionCurrent(generation) ? 'resumed' : 'ended';
      }
      await sleepFn(100);
    }

    if (!isSessionCurrent(generation)) {
      try {
        await stopListen({ skipTurn: true });
      } catch {
        /* ignore */
      }
      return 'ended';
    }

    try {
      await stopListen({ skipTurn: true });
    } catch {
      /* ignore */
    }
    return 'done';
  }

  async function collectTranscriptWithContinuations(generation) {
    let pending = '';

    while (isSessionCurrent(generation)) {
      await startListen({ endpointing: true, clearHeard: !pending });
      if (!isSessionCurrent(generation)) {
        try {
          await stopListen({ skipTurn: true });
        } catch {
          /* session ending */
        }
        break;
      }

      await waitForUtterance(generation);
      if (!isSessionCurrent(generation)) {
        try {
          await stopListen({ skipTurn: true });
        } catch {
          /* session ending */
        }
        break;
      }

      clearListenTimeout();
      if (listenStartRequest) await listenStartRequest;
      const result = await sidecarClient.listenStop();
      if (!isSessionCurrent(generation)) break;

      const text = typeof result?.text === 'string' ? result.text.trim() : '';
      if (text) {
        pending = joinTranscript(pending, text);
        state.heard = pending;
        state.status = 'listening';
        state.error = null;
        sendState();
      }

      if (!pending) {
        state.status = 'listening';
        sendState();
        return '';
      }

      const probe = await probeForContinuation(generation);
      if (probe === 'ended' || probe === 'done') break;

      if (!isSessionCurrent(generation)) {
        try {
          await stopListen({ skipTurn: true });
        } catch {
          /* ignore */
        }
        break;
      }
      clearListenTimeout();
      if (listenStartRequest) await listenStartRequest;
      const continued = await sidecarClient.listenStop();
      if (!isSessionCurrent(generation)) break;
      const more = typeof continued?.text === 'string' ? continued.text.trim() : '';
      if (more) {
        pending = joinTranscript(pending, more);
        state.heard = pending;
        state.status = 'listening';
        sendState();
      }
    }

    return pending;
  }

  async function runContinuousSession(generation) {
    while (isSessionCurrent(generation)) {
      try {
        if (!canStartListen(state.status) && state.status !== 'listening') {
          await sleepFn(100);
          continue;
        }

        const text = await collectTranscriptWithContinuations(generation);
        if (!isSessionCurrent(generation)) break;

        if (!text) {
          state.status = 'listening';
          state.error = null;
          sendState();
          continue;
        }

        await runTurn(text);
      } catch {
        if (!isSessionCurrent(generation)) break;
        await sleepFn(500);
        if (state.status === 'error') {
          state.status = 'idle';
          sendState();
        }
      }
    }

    if (generation === sessionGeneration && !sessionActive) {
      if (state.status === 'listening') {
        try {
          await stopListen({ skipTurn: true });
        } catch {
          /* ignore */
        }
      }
      if (state.status === 'listening' || state.status === 'idle') {
        state.status = 'idle';
        sendState();
      }
    }
  }

  function startContinuousSession() {
    if (sessionActive) return;
    sessionActive = true;
    sessionGeneration += 1;
    const generation = sessionGeneration;
    state.status = 'listening';
    state.error = null;
    sendState();
    void runContinuousSession(generation);
  }

  async function stopContinuousSession() {
    if (!sessionActive) {
      if (state.status === 'listening') void stopListen();
      return;
    }
    sessionActive = false;
    sessionGeneration += 1;
    clearListenTimeout();
    try {
      if (state.status === 'listening' || listenStartRequest) {
        await stopListen({ skipTurn: true });
      }
    } catch {
      /* ignore */
    }
    if (state.status === 'listening' || state.status === 'error') {
      state.status = 'idle';
      state.error = null;
    }
    sendState();
  }

  function toggleListen() {
    if (state.status === 'listening') {
      void stopListen();
    } else if (canStartListen(state.status)) {
      void startListen({ endpointing: false });
    }
  }

  function toggleContinuousSession() {
    if (sessionActive) {
      void stopContinuousSession();
    } else {
      startContinuousSession();
    }
  }

  function isContinuousSessionActive() {
    return sessionActive;
  }

  return {
    startListen,
    stopListen,
    toggleListen,
    clearListenTimeout,
    startContinuousSession,
    stopContinuousSession,
    toggleContinuousSession,
    isContinuousSessionActive,
  };
}

module.exports = {
  MAX_LISTEN_SECONDS,
  JARVIS_SILENCE_MS,
  INTERVIEW_SILENCE_MS,
  CONTINUATION_PROBE_MS,
  canStartListen,
  buildListenStartBody,
  releasePendingListenStart,
  resolveInterviewLoopbackId,
  isWasapiLoopbackId,
  joinTranscript,
  createListenHandlers,
};
