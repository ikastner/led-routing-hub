const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");
const statusBox = document.getElementById("status-box");
const universeSelect = document.getElementById("universe-select");
const dmxGrid = document.getElementById("dmx-grid");
const configEditor = document.getElementById("config-editor");
const configErrors = document.getElementById("config-errors");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    panels.forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
  });
});

async function refreshStatus() {
  const status = await window.routing.status();
  statusBox.textContent = JSON.stringify(status, null, 2);
}

async function loadUniverses() {
  const universes = await window.routing.listUniverses();
  universeSelect.innerHTML = "";
  for (const u of universes) {
    const opt = document.createElement("option");
    opt.value = `${u.ip}|${u.universe}`;
    opt.textContent = `${u.label} — ${u.ip} univers ${u.universe}`;
    universeSelect.appendChild(opt);
  }
}

async function refreshMonitor() {
  const val = universeSelect.value;
  if (!val) return;
  const [ip, universe] = val.split("|");
  const data = await window.routing.dmxSnapshot(ip, Number(universe));
  dmxGrid.innerHTML = "";
  if (!data) {
    dmxGrid.textContent = "Aucune donnée (démarrez le moteur + faker)";
    return;
  }
  for (let i = 0; i < 512; i += 1) {
    const v = data[i] ?? 0;
    const cell = document.createElement("div");
    cell.className = "dmx-cell";
    cell.style.background = `rgb(${v},${v},${v})`;
    cell.title = `Canal ${i + 1} = ${v}`;
    cell.innerHTML = v > 0 ? `<span>${i + 1}</span>` : "";
    dmxGrid.appendChild(cell);
  }
}

async function loadConfigEditor() {
  const config = await window.routing.getConfig();
  configEditor.value = JSON.stringify(config, null, 2);
  const errors = await window.routing.validateConfig(config);
  configErrors.textContent = errors.length ? errors.join("\n") : "";
}

document.getElementById("btn-start").addEventListener("click", async () => {
  const dryRun = document.getElementById("dry-run").checked;
  await window.routing.start({ dryRun });
  await refreshStatus();
});

document.getElementById("btn-stop").addEventListener("click", async () => {
  await window.routing.stop();
  await refreshStatus();
});

document.getElementById("btn-blackout").addEventListener("click", async () => {
  await window.routing.blackout();
});

document.getElementById("btn-refresh-monitor").addEventListener("click", refreshMonitor);
document.getElementById("btn-reload-config").addEventListener("click", loadConfigEditor);
document.getElementById("btn-save-config").addEventListener("click", async () => {
  try {
    const config = JSON.parse(configEditor.value);
    const errors = await window.routing.validateConfig(config);
    if (errors.length) {
      configErrors.textContent = errors.join("\n");
      return;
    }
    await window.routing.saveConfig(config);
    configErrors.textContent = "Config enregistrée.";
  } catch (err) {
    configErrors.textContent = err.message;
  }
});

loadUniverses();
loadConfigEditor();
refreshStatus();
setInterval(refreshStatus, 1000);
setInterval(() => {
  if (document.getElementById("monitor").classList.contains("active")) {
    refreshMonitor();
  }
}, 200);
