const path = require("path");
const { app, BrowserWindow } = require("electron");
const { RoutingEngine } = require("./engine");
const { setupIpc } = require("./ipc");

const engine = new RoutingEngine();
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
  setupIpc(engine);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  await engine.stop();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  await engine.stop();
});
