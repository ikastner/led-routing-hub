const fs = require("fs");
const path = require("path");
const {
  loadConfig,
  saveConfig,
  validateConfig,
  printInstallInfo,
  getProjector,
  getLyres,
} = require("../core/config");
const { createBufferManager } = require("../core/dmxBuffers");
const { startStateReceiver } = require("../core/stateReceiver");
const { startSenderLoop } = require("../core/senderLoop");
const { startWatchdog } = require("../core/watchdog");
const { blackoutAll } = require("../core/blackout");
const { STATE_PORT } = require("../core/protocol");
const { createConfigServer, CONFIG_API_PORT } = require("../core/configServer");
const { murLedToWallBands, deriveAndWriteWallBands } = require("../core/wallBands");
const { parseEcran, MAPPING_PATH } = require("../core/parseEcran");
const {
  ensureMigrated,
  listProfiles,
  getActiveProfile,
  setActiveProfile,
  createProfile,
  deleteProfile,
  renameProfile,
  profileDir,
} = require("../core/profiles");

class RoutingEngine {
  constructor() {
    this.config = null;
    this.bufferManager = null;
    this.receiver = null;
    this.sender = null;
    this.watchdog = null;
    this.running = false;
    this.options = {
      port: STATE_PORT,
      hz: 40,
      dryRun: false,
      watchdogMs: 2000,
      configApiPort: CONFIG_API_PORT,
    };
    this.stats = {
      receiver: {},
      senderTicks: 0,
      watchdogBlackout: false,
    };

    ensureMigrated();

    this.configServer = createConfigServer(() => {
      const active = getActiveProfile();
      return {
        running: this.running,
        statePort: this.options.port,
        profileId: active.id,
        profileLabel: active.label,
        getConfig: () => this.getConfig(),
      };
    });
  }

  async startConfigApi(options = {}) {
    if (this.configServer.isListening()) {
      return { port: this.configServer.getPort() };
    }
    return this.configServer.start({
      port: options.configApiPort ?? this.options.configApiPort ?? CONFIG_API_PORT,
    });
  }

  stopConfigApi() {
    this.configServer.stop();
  }

  async start(options = {}) {
    if (this.running) return this.getStatus();

    this.options = { ...this.options, ...options };
    if (options.profile) {
      setActiveProfile(options.profile);
    }

    this.config = loadConfig();
    this.bufferManager = createBufferManager(this.config);

    await this.startConfigApi({ configApiPort: this.options.configApiPort });

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

  getWallBands() {
    const active = getActiveProfile();
    return murLedToWallBands(this.getConfig(), {
      profile: active.id,
      generatedFrom: this.getConfig().generatedFrom ?? active.configPath,
    });
  }

  exportWallBands(outPath) {
    const active = getActiveProfile();
    return deriveAndWriteWallBands(
      this.getConfig(),
      outPath ?? active.wallBandsPath,
      {
        profile: active.id,
        generatedFrom: this.getConfig().generatedFrom ?? active.configPath,
      },
    );
  }

  listProfiles() {
    return listProfiles();
  }

  getActiveProfile() {
    return getActiveProfile();
  }

  createProfile(input) {
    return createProfile(input);
  }

  deleteProfile(profileId) {
    return deleteProfile(profileId);
  }

  renameProfile(profileId, label) {
    return renameProfile(profileId, label);
  }

  getInstallSummary() {
    const config = this.getConfig();
    const active = getActiveProfile();
    const errors = validateConfig(config);
    const led = (config.segments ?? []).filter((s) => s.type === "rgb");
    const projector = getProjector(config);
    const lyres = getLyres(config);
    return {
      profile: { id: active.id, label: active.label },
      controllers: config.controllers?.length ?? 0,
      ledBands: led.length,
      ledEntities: led.reduce((sum, s) => sum + (s.entityCount ?? 0), 0),
      lyres: lyres.length,
      projector: projector
        ? {
            name: projector.name,
            controllerIp: projector.controllerIp,
            universe: projector.universe,
          }
        : null,
      errors,
      generatedFrom: config.generatedFrom ?? null,
    };
  }

  /**
   * Importe un Excel dans le profil actif : parse → validate → save (+ archive Ecran.xlsx).
   */
  importExcel(xlsxPath) {
    const config = parseEcran(xlsxPath);
    const errors = validateConfig(config);
    if (errors.length) {
      return { ok: false, errors, config: null };
    }

    const active = getActiveProfile();
    saveConfig(config);
    this.config = config;

    const archivePath = path.join(profileDir(active.id), "Ecran.xlsx");
    try {
      fs.copyFileSync(xlsxPath, archivePath);
    } catch (_) {
      /* archive optionnelle */
    }

    if (this.running) {
      this.bufferManager = createBufferManager(this.config);
    }

    return {
      ok: true,
      errors: [],
      profile: getActiveProfile(),
      summary: this.getInstallSummary(),
      wallBandsPath: active.wallBandsPath,
      archivedExcel: fs.existsSync(archivePath) ? archivePath : null,
    };
  }

  getTemplatePath() {
    return MAPPING_PATH;
  }

  /**
   * Active un profil. Si le moteur tourne : stop (blackout) + restart avec la nouvelle config.
   */
  async activateProfile(profileId) {
    const wasRunning = this.running;
    const savedOptions = { ...this.options };

    if (wasRunning) {
      await this.stop();
    }

    const active = setActiveProfile(profileId);
    this.config = loadConfig();

    if (wasRunning) {
      await this.start(savedOptions);
    }

    return {
      ok: true,
      profile: active,
      running: this.running,
      errors: validateConfig(this.config),
    };
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
    const active = getActiveProfile();
    return {
      running: this.running,
      buffers: this.bufferManager?.size ?? 0,
      options: this.options,
      profile: {
        id: active.id,
        label: active.label,
        configPath: active.configPath,
      },
      configApi: {
        listening: this.configServer.isListening(),
        port: this.configServer.getPort(),
        url: `http://127.0.0.1:${this.configServer.getPort()}`,
      },
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
