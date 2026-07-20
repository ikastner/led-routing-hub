const fs = require("fs");
const { ipcMain, dialog, BrowserWindow } = require("electron");

function getParentWindow() {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

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
  ipcMain.handle("engine:start-config-api", async (_evt, options) => engine.startConfigApi(options));
  ipcMain.handle("engine:profiles:list", () => engine.listProfiles());
  ipcMain.handle("engine:profiles:active", () => engine.getActiveProfile());
  ipcMain.handle("engine:profiles:activate", async (_evt, id) => engine.activateProfile(id));
  ipcMain.handle("engine:profiles:create", (_evt, input) => engine.createProfile(input));
  ipcMain.handle("engine:profiles:delete", (_evt, id) => engine.deleteProfile(id));
  ipcMain.handle("engine:profiles:rename", (_evt, id, label) => engine.renameProfile(id, label));
  ipcMain.handle("engine:install-summary", () => engine.getInstallSummary());

  ipcMain.handle("engine:import-excel", async () => {
    const win = getParentWindow();
    const result = await dialog.showOpenDialog(win, {
      title: "Importer un mapping Excel",
      properties: ["openFile"],
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { ok: false, canceled: true };
    }
    try {
      return engine.importExcel(result.filePaths[0]);
    } catch (err) {
      return { ok: false, errors: [err.message] };
    }
  });

  ipcMain.handle("engine:download-template", async () => {
    const template = engine.getTemplatePath();
    if (!fs.existsSync(template)) {
      return { ok: false, error: `Template introuvable : ${template}` };
    }
    const win = getParentWindow();
    const result = await dialog.showSaveDialog(win, {
      title: "Enregistrer le template Excel",
      defaultPath: "Ecran.xlsx",
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });
    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true };
    }
    fs.copyFileSync(template, result.filePath);
    return { ok: true, path: result.filePath };
  });

  ipcMain.handle("engine:export-wall-bands", async (_evt, outPath) => {
    let target = outPath;
    if (!target) {
      const win = getParentWindow();
      const active = engine.getActiveProfile();
      const result = await dialog.showSaveDialog(win, {
        title: "Exporter wall-bands.json (authoring)",
        defaultPath: `${active.id}-wall-bands.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true };
      }
      target = result.filePath;
    }
    const wallBands = engine.exportWallBands(target);
    return { ok: true, path: target, bands: wallBands?.bands?.length ?? 0 };
  });
}

module.exports = { setupIpc };
