const { ipcMain } = require("electron");
const { RoutingEngine } = require("./engine");

function setupIpc(engine) {
  ipcMain.handle("engine:start", async (_evt, options) => engine.start(options));
  ipcMain.handle("engine:stop", async () => engine.stop());
  ipcMain.handle("engine:status", () => engine.getStatus());
  ipcMain.handle("engine:blackout", async () => engine.triggerBlackout());
  ipcMain.handle("engine:config", () => engine.getConfig());
  ipcMain.handle("engine:reload-config", () => engine.reloadConfig());
  ipcMain.handle("engine:save-config", (_evt, config) => engine.saveConfigData(config));
  ipcMain.handle("engine:validate-config", (_evt, config) => engine.validateConfigData(config));
  ipcMain.handle("engine:universes", () => engine.listUniverses());
  ipcMain.handle("engine:dmx-snapshot", (_evt, ip, universe) => engine.getDmxSnapshot(ip, universe));
  ipcMain.handle("engine:wall-bands", () => engine.getWallBands());
  ipcMain.handle("engine:export-wall-bands", (_evt, outPath) => engine.exportWallBands(outPath));
  ipcMain.handle("engine:start-config-api", async (_evt, options) => engine.startConfigApi(options));
}

module.exports = { setupIpc };
