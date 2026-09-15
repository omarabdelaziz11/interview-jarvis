const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  canStartListen,
  buildListenStartBody,
  releasePendingListenStart,
  createListenHandlers,
  MAX_LISTEN_SECONDS,
} = require('./listen-pipeline');

describe('listen-pipeline helpers', () => {
  it('canStartListen allows idle and error only', () => {
    assert.equal(canStartListen('idle'), true);
    assert.equal(canStartListen('error'), true);
    assert.equal(canStartListen('listening'), false);
    assert.equal(canStartListen('thinking'), false);
    assert.equal(canStartListen('speaking'), false);
  });

  it('buildListenStartBody forwards device IDs and max_seconds', () => {
    assert.deepEqual(
      buildListenStartBody({
        micDeviceId: 'mic-1',
        loopbackDeviceId: 'loop-2',
      }),
      {
        mic_device_id: 'mic-1',
        loopback_device_id: 'loop-2',
        max_seconds: MAX_LISTEN_SECONDS,
      },
    );
  });

  it('releasePendingListenStart clears only the completed request', () => {
    const pending = Promise.resolve();
    const newer = Promise.resolve();

    assert.equal(releasePendingListenStart(pending, pending), null);
    assert.equal(releasePendingListenStart(newer, pending), newer);
  });
});

describe('createListenHandlers', () => {
  let state;
  let listenStartCalls;
  let sidecarClient;

  beforeEach(() => {
    state = {
      status: 'idle',
      error: null,
      heard: null,
      lastTurnFailed: true,
    };
    listenStartCalls = [];
    sidecarClient = {
      listenStart(body) {
        listenStartCalls.push(body);
        return Promise.resolve();
      },
      listenStop: async () => ({ text: 'hello' }),
    };
  });

  function createHandlers(overrides = {}) {
    return createListenHandlers(state, {
      sidecarClient,
      getSettings: () => ({
        micDeviceId: 'mic-a',
        loopbackDeviceId: 'loop-b',
      }),
      sendState: () => {},
      showSidecarError: (message) => {
        state.status = 'error';
        state.error = message;
      },
      runTurn: async () => {},
      setTimeoutFn: () => 1,
      clearTimeoutFn: () => {},
      ...overrides,
    });
  }

  it('ignores startListen while thinking', async () => {
    state.status = 'thinking';
    const { startListen } = createHandlers();

    await startListen();

    assert.equal(state.status, 'thinking');
    assert.equal(listenStartCalls.length, 0);
  });

  it('forwards device IDs and max_seconds to listenStart', async () => {
    const { startListen } = createHandlers({ maxSeconds: 42 });

    await startListen();

    assert.deepEqual(listenStartCalls, [
      {
        mic_device_id: 'mic-a',
        loopback_device_id: 'loop-b',
        max_seconds: 42,
      },
    ]);
  });

  it('clears lastTurnFailed on new listen', async () => {
    const { startListen } = createHandlers();

    await startListen();

    assert.equal(state.lastTurnFailed, false);
    assert.equal(state.status, 'listening');
  });

  it('does not clear a newer pending listenStart when an older request completes', async () => {
    let resolveFirst;
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const second = Promise.resolve();
    let call = 0;

    sidecarClient.listenStart = () => {
      call += 1;
      return call === 1 ? first : second;
    };

    const { startListen } = createHandlers();
    const firstStart = startListen();
    state.status = 'idle';
    state.error = null;
    await startListen();
    resolveFirst();
    await firstStart;

    assert.equal(releasePendingListenStart(second, first), second);
  });
});
