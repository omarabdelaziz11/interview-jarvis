const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { SidecarManager, MAX_RESTARTS } = require('./sidecar-manager');

function createMockChild() {
  const child = new EventEmitter();
  child.kill = () => {
    child.exitCode = 1;
    child.emit('exit', 1, null);
  };
  child.exitCode = null;
  return child;
}

function createManager(overrides = {}) {
  let nextChild = overrides.child || createMockChild();
  const client = {
    health: async () => ({ ok: true }),
    ...(overrides.client || {}),
  };
  const settingsProvider = () => ({
    sidecarPython: 'python',
    whisperModel: 'small',
    ...(overrides.settings || {}),
  });
  const spawnProcess = () => {
    nextChild = overrides.spawnChild ? overrides.spawnChild() : createMockChild();
    return nextChild;
  };

  const manager = new SidecarManager({
    client,
    settingsProvider,
    spawnProcess,
    healthIntervalMs: 50,
    delayFn: async () => {},
    ...overrides.managerOptions,
  });

  activeManagers.add(manager);
  return { manager, getChild: () => nextChild, client };
}

function cleanupManager(manager) {
  manager.stopping = true;
  manager.recovering = false;
  manager.stopHealthPolling();
  if (manager.restartTimer) {
    clearTimeout(manager.restartTimer);
    manager.restartTimer = null;
  }
  manager.process = null;
}

const activeManagers = new Set();

describe('SidecarManager', () => {
  afterEach(() => {
    for (const manager of activeManagers) cleanupManager(manager);
    activeManagers.clear();
  });
  it('resets restartCount after a successful health poll', async () => {
    const { manager } = createManager();
    manager.restartCount = 3;
    manager.stopping = false;

    await manager.pollHealth();

    assert.equal(manager.restartCount, 0);
  });

  it('resets restartCount after ensureHealthy succeeds', async () => {
    const { manager } = createManager();
    manager.restartCount = 4;
    manager.stopping = false;

    await manager.ensureHealthy(100);

    assert.equal(manager.restartCount, 0);
  });

  it('allows restarts again after recovery clears the consecutive budget', async () => {
    const { manager } = createManager();
    manager.stopping = false;
    manager.restartCount = MAX_RESTARTS;

    await manager.pollHealth();

    assert.equal(manager.restartCount, 0);

    manager.scheduleRestart({ reason: 'test' });
    assert.equal(manager.restartCount, 1);
    assert.ok(manager.restartTimer);
  });

  it('requires three consecutive health failures before restarting', async () => {
    let killed = false;
    const child = createMockChild();
    child.kill = () => {
      killed = true;
      child.exitCode = 1;
      child.emit('exit', 1, null);
    };

    const { manager } = createManager({
      client: { health: async () => ({ ok: false }) },
      spawnChild: () => child,
    });

    manager.start();

    await manager.pollHealth();
    await manager.pollHealth();

    assert.equal(killed, false);
    assert.equal(manager.restartCount, 0);

    await manager.pollHealth();

    assert.equal(killed, true);
    assert.equal(manager.restartCount, 1);
    assert.ok(manager.restartTimer);
  });

  it('clears consecutive health failures after an ok response', async () => {
    let healthy = false;
    const { manager } = createManager({
      client: { health: async () => ({ ok: healthy }) },
    });
    manager.stopping = false;

    await manager.pollHealth();
    await manager.pollHealth();
    healthy = true;
    await manager.pollHealth();

    assert.equal(manager.consecutiveHealthFailures, 0);
  });

  it('does not schedule overlapping restarts', async () => {
    const { manager } = createManager();
    manager.stopping = false;

    manager.scheduleRestart({ reason: 'first' });
    const firstTimer = manager.restartTimer;
    manager.scheduleRestart({ reason: 'second' });

    assert.equal(manager.restartTimer, firstTimer);
    assert.equal(manager.restartCount, 1);
  });

  it('stops health polling on stop()', async () => {
    const { manager } = createManager();
    manager.stopping = false;
    manager.startHealthPolling();

    assert.ok(manager.healthPollTimer);

    await manager.stop();

    assert.equal(manager.healthPollTimer, null);
  });
});
