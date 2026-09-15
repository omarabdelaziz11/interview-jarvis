const { spawn } = require('child_process');
const path = require('path');

const sidecarClient = require('./sidecar-client');
const { getSettings } = require('./settings');

const DEFAULT_HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_INTERVAL_MS = 2_000;
const MAX_RESTARTS = 5;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class SidecarManager {
  constructor(options = {}) {
    this.client = options.client || sidecarClient;
    this.settingsProvider = options.settingsProvider || getSettings;
    this.spawnProcess = options.spawnProcess || spawn;
    this.sidecarDir =
      options.sidecarDir || path.resolve(__dirname, '..', '..', '..', 'services', 'sidecar');
    this.process = null;
    this.restartTimer = null;
    this.restartCount = 0;
    this.stopping = true;
    this.statusListeners = new Set();
  }

  onStatus(callback) {
    if (typeof callback !== 'function') throw new TypeError('Status callback must be a function');
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  emitStatus(status, detail = {}) {
    for (const callback of this.statusListeners) {
      try {
        callback({ status, ...detail });
      } catch {
        // A UI listener must not interrupt process supervision.
      }
    }
  }

  start() {
    if (this.process) return;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.stopping = false;
    this.restartCount = 0;
    this.spawn();
  }

  spawn() {
    if (this.stopping || this.process) return;

    const settings = this.settingsProvider();
    const child = this.spawnProcess(settings.sidecarPython, ['-m', 'app.main'], {
      cwd: this.sidecarDir,
      env: { ...process.env, WHISPER_MODEL: settings.whisperModel },
      stdio: 'ignore',
      windowsHide: true,
    });
    this.process = child;
    this.emitStatus('starting');

    let handledExit = false;
    const handleExit = (detail) => {
      if (handledExit) return;
      handledExit = true;
      if (this.process === child) this.process = null;
      if (this.stopping) {
        this.emitStatus('stopped');
        return;
      }
      this.scheduleRestart(detail);
    };

    child.once('error', (error) => handleExit({ error: error.message }));
    child.once('exit', (code, signal) => handleExit({ code, signal }));
  }

  scheduleRestart(detail) {
    if (this.restartCount >= MAX_RESTARTS) {
      this.emitStatus('failed', detail);
      return;
    }

    this.restartCount += 1;
    const delayMs = Math.min(this.restartCount * 1_000, 5_000);
    this.emitStatus('restarting', { ...detail, attempt: this.restartCount, delayMs });
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      try {
        this.spawn();
      } catch (error) {
        this.scheduleRestart({ error: error.message });
      }
    }, delayMs);
  }

  async ensureHealthy(timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS) {
    if (!this.process && !this.restartTimer && !this.stopping) this.spawn();
    const deadline = Date.now() + timeoutMs;
    let lastError;

    while (Date.now() < deadline) {
      try {
        const result = await this.client.health();
        if (result?.ok) {
          this.emitStatus('healthy', { health: result });
          return result;
        }
        lastError = new Error('Sidecar reported an unhealthy status');
      } catch (error) {
        lastError = error;
      }
      await delay(Math.min(HEALTH_INTERVAL_MS, Math.max(0, deadline - Date.now())));
    }

    throw new Error('Sidecar did not become healthy within the startup timeout', {
      cause: lastError,
    });
  }

  async stop() {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    const child = this.process;
    this.process = null;
    if (!child || child.exitCode !== null) {
      this.emitStatus('stopped');
      return;
    }

    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 5_000);
      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
      child.kill();
    });
    this.emitStatus('stopped');
  }
}

module.exports = { SidecarManager };
