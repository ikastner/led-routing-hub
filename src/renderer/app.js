const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");
const statusBox = document.getElementById("status-box");
const universeSelect = document.getElementById("universe-select");
const dmxGrid = document.getElementById("dmx-grid");
const configEditor = document.getElementById("config-editor");
const configErrors = document.getElementById("config-errors");
const profilesList = document.getElementById("profiles-list");
const profilesMsg = document.getElementById("profiles-msg");
const configProfileLabel = document.getElementById("config-profile-label");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    panels.forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
    if (tab.dataset.tab === "profiles") refreshProfiles();
  });
});

async function refreshStatus() {
  const status = await window.routing.status();
  if (status?.configApi?.listening) {
    status.configApi.wallBandsUrl = `${status.configApi.url}/api/wall-bands`;
  }
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
  const active = await window.routing.getActiveProfile();
  if (configProfileLabel) {
    configProfileLabel.textContent = `Profil : ${active.id} (${active.label})`;
  }
  const config = await window.routing.getConfig();
  configEditor.value = JSON.stringify(config, null, 2);
  const errors = await window.routing.validateConfig(config);
  configErrors.textContent = errors.length ? errors.join("\n") : "";
}

async function refreshProfiles() {
  profilesMsg.textContent = "";
  const profiles = await window.routing.listProfiles();
  profilesList.innerHTML = "";
  for (const p of profiles) {
    const li = document.createElement("li");
    if (p.active) li.classList.add("active");

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<strong>${p.label}</strong><span>${p.id}${p.updatedAt ? ` · ${p.updatedAt}` : ""}</span>`;
    li.appendChild(meta);

    if (p.active) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "actif";
      li.appendChild(badge);
    } else {
      const btnActivate = document.createElement("button");
      btnActivate.textContent = "Activer";
      btnActivate.addEventListener("click", async () => {
        try {
          await window.routing.activateProfile(p.id);
          await refreshProfiles();
          await loadConfigEditor();
          await loadUniverses();
          await refreshStatus();
        } catch (err) {
          profilesMsg.textContent = err.message;
        }
      });
      li.appendChild(btnActivate);

      if (p.id !== "default") {
        const btnDelete = document.createElement("button");
        btnDelete.className = "danger";
        btnDelete.textContent = "Supprimer";
        btnDelete.addEventListener("click", async () => {
          if (!confirm(`Supprimer le profil « ${p.id} » ?`)) return;
          try {
            await window.routing.deleteProfile(p.id);
            await refreshProfiles();
          } catch (err) {
            profilesMsg.textContent = err.message;
          }
        });
        li.appendChild(btnDelete);
      }
    }

    profilesList.appendChild(li);
  }
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
document.getElementById("btn-refresh-profiles").addEventListener("click", refreshProfiles);

document.getElementById("btn-create-profile").addEventListener("click", async () => {
  const id = document.getElementById("profile-id").value.trim();
  const label = document.getElementById("profile-label").value.trim();
  if (!id) {
    profilesMsg.textContent = "Identifiant requis";
    return;
  }
  try {
    await window.routing.createProfile({ id, label: label || id });
    document.getElementById("profile-id").value = "";
    document.getElementById("profile-label").value = "";
    await refreshProfiles();
  } catch (err) {
    profilesMsg.textContent = err.message;
  }
});

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
refreshProfiles();
refreshStatus();
setInterval(refreshStatus, 1000);
setInterval(() => {
  if (document.getElementById("monitor").classList.contains("active")) {
    refreshMonitor();
  }
}, 200);
