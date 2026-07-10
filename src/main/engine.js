const { loadConfig, saveConfig, validateConfig, printInstallInfo } = require("../core/config");
const { createBufferManager } = require("../core/dmxBuffers");
const { startStateReceiver } = require("../core/stateReceiver");
const { startSenderLoop } = require("../core/senderLoop");
const { startWatchdog } = require("../core/watchdog");
const { blackoutAll } = require("../core/blackout");
const { STATE_PORT } = require("../core/protocol");

class RoutingEngine {
  constructor() {
    this.config = null;
    this.bufferManager = null;
    this.receiver = null;
    this.sender = null;
    this.watchdog = null;
    this.running = false;
    this.options = { port: STATE_PORT, hz: 40, dryRun: false, watchdogMs: 2000 };
    this.stats = {
      receiver: {},
      senderTicks: 0,
      watchdogBlackout: false,
    };
  }

  async start(options = {}) {
    if (this.running) return this.getStatus();

    this.options = { ...this.options, ...options };
    this.config = loadConfig();
    this.bufferManager = createBufferManager(this.config);

    this.receiver = startStateReceiver(this.bufferManager, {
      port: this.options.port,
      onStats: (s) => {
        this.stats.receiver = s;
      },
    });
    await this.receiver.ready;

    this.sender = startSenderLoop(this.bufferManager, {
      hz: this.options.hz,
      dryRun: this.options.dryRun,
    });

    this.watchdog = startWatchdog(this.bufferManager, this.receiver, {
      timeoutMs: this.options.watchdogMs,
    });

    this.running = true;
    return this.getStatus();
  }

  async stop() {
    if (!this.running) return;

    this.watchdog?.stop();
    this.sender?.stop();
    this.receiver?.stop();

    if (!this.options.dryRun && this.config) {
      try {
        await blackoutAll(this.config, { repeat: 5, hz: 40 });
      } catch (_) {
        /* ignore */
      }
    }

    this.running = false;
    this.bufferManager = null;
    this.receiver = null;
    this.sender = null;
    this.watchdog = null;
  }

  async triggerBlackout() {
    if (this.bufferManager) {
      this.bufferManager.blackoutAll();
    } else if (this.config) {
      await blackoutAll(this.config);
    }
  }

  getConfig() {
    return this.config ?? loadConfig();
  }

  reloadConfig() {
    this.config = loadConfig();
    if (this.running) {
      this.bufferManager = createBufferManager(this.config);
    }
    return { ok: true, errors: validateConfig(this.config) };
  }

  saveConfigData(config) {
    saveConfig(config);
    this.config = config;
    if (this.running) {
      this.bufferManager = createBufferManager(this.config);
    }
    return { ok: true };
  }

  validateConfigData(config) {
    return validateConfig(config);
  }

  getDmxSnapshot(ip, universe) {
    if (!this.bufferManager) return null;
    const buf = this.bufferManager.getSnapshot(ip, universe);
    return buf ? Array.from(buf) : null;
  }

  listUniverses() {
    const config = this.getConfig();
    const universes = [];
    for (const c of config.controllers) {
      for (let u = c.universeMin; u <= c.universeMax; u += 1) {
        universes.push({ ip: c.ip, universe: u, label: c.label });
      }
    }
    return universes;
  }

  getStatus() {
    return {
      running: this.running,
      buffers: this.bufferManager?.size ?? 0,
      options: this.options,
      stats: {
        ...this.stats,
        watchdogBlackout: this.watchdog?.isBlackoutActive?.() ?? false,
      },
      install: this.config
        ? {
            controllers: this.config.controllers.length,
            segments: this.config.segments.length,
            ledEntities: this.config.stats?.ledEntityCount,
          }
        : null,
    };
  }

  printInfo() {
    printInstallInfo(this.getConfig());
  }
}

module.exports = { RoutingEngine };
