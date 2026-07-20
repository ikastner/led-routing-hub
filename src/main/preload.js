const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("routing", {
  start: (options) => ipcRenderer.invoke("engine:start", options),
  stop: () => ipcRenderer.invoke("engine:stop"),
  status: () => ipcRenderer.invoke("engine:status"),
  blackout: () => ipcRenderer.invoke("engine:blackout"),
  getConfig: () => ipcRenderer.invoke("engine:config"),
  reloadConfig: () => ipcRenderer.invoke("engine:reload-config"),
  saveConfig: (config) => ipcRenderer.invoke("engine:save-config", config),
  validateConfig: (config) => ipcRenderer.invoke("engine:validate-config", config),
  listUniverses: () => ipcRenderer.invoke("engine:universes"),
  dmxSnapshot: (ip, universe) => ipcRenderer.invoke("engine:dmx-snapshot", ip, universe),
  getWallBands: () => ipcRenderer.invoke("engine:wall-bands"),
  exportWallBands: (outPath) => ipcRenderer.invoke("engine:export-wall-bands", outPath),
  startConfigApi: (options) => ipcRenderer.invoke("engine:start-config-api", options),
  listProfiles: () => ipcRenderer.invoke("engine:profiles:list"),
  getActiveProfile: () => ipcRenderer.invoke("engine:profiles:active"),
  activateProfile: (id) => ipcRenderer.invoke("engine:profiles:activate", id),
  createProfile: (input) => ipcRenderer.invoke("engine:profiles:create", input),
  deleteProfile: (id) => ipcRenderer.invoke("engine:profiles:delete", id),
});
