/** 
 Gère la configuration des entités LED et des devices par fichier JSON.
**/

const fs = require("fs");
const { CONFIG_PATH } = require("./paths");

function loadConfig(configPath = CONFIG_PATH) {
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Config introuvable : ${configPath}\nLancez : npm run parse`
    );
  }
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

function saveConfig(config, configPath = CONFIG_PATH) {
  const errors = validateConfig(config);
  if (errors.length) {
    throw new Error(`Config invalide :\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

function validateConfig(config) {
  const errors = [];

  if (!config.controllers?.length) {
    errors.push("Aucun contrôleur défini");
    return errors;
  }

  const ips = new Set();
  for (const c of config.controllers) {
    if (!c.ip) errors.push(`Contrôleur sans IP (${c.label ?? "?"})`);
    if (ips.has(c.ip)) errors.push(`IP dupliquée : ${c.ip}`);
    ips.add(c.ip);
    if (c.universeMin > c.universeMax) {
      errors.push(`${c.ip} : universeMin > universeMax`);
    }
  }

  const channelUsage = new Map();

  for (const seg of config.segments ?? []) {
    const key = `${seg.controllerIp}:${seg.universe}`;
    const start = seg.dmxChannelStart ?? 1;
    const channels = (seg.channelsPerEntity ?? 3) * (seg.entityCount ?? 1);
    const end = seg.dmxChannelEnd ?? start + channels - 1;

    if (end > 512) {
      errors.push(`Segment ${seg.name} : canaux dépassent 512 (fin=${end})`);
    }

    const ranges = channelUsage.get(key) ?? [];
    for (const existing of ranges) {
      if (!(end < existing.start || start > existing.end)) {
        errors.push(`Recouvrement DMX ${key} canaux ${start}-${end} vs ${existing.start}-${existing.end} (${existing.name})`);
      }
    }
    ranges.push({ start, end, name: seg.name });
    channelUsage.set(key, ranges);
  }

  return errors;
}

function getControllers(config) {
  return config.controllers.map((c) => ({
    ip: c.ip,
    label: c.label,
    universes: `${c.universeMin}–${c.universeMax}`,
  }));
}

function getProjector(config) {
  return config.segments.find((s) => s.type === "rgbw") ?? null;
}

function getLyres(config) {
  return config.segments.filter((s) => s.type === "moving_head");
}

function printInstallInfo(config) {
  console.log("=== Contrôleurs BC216 ===");
  for (const c of getControllers(config)) {
    console.log(`  ${c.ip}  (${c.label})  univers ${c.universes}`);
  }

  const projector = getProjector(config);
  if (projector) {
    console.log("\n=== Projecteur RGBW ===");
    console.log(
      `  entité ${projector.entityStart}  →  ${projector.controllerIp}  univers ${projector.universe}  canaux ${projector.dmxChannelStart}–${projector.dmxChannelEnd}`
    );
  }

  const lyres = getLyres(config);
  if (lyres.length) {
    console.log("\n=== Lyres ===");
    lyres.forEach((lyre, i) => {
      console.log(
        `  Lyre ${i + 1} (${lyre.name})  →  ${lyre.controllerIp}  univers ${lyre.universe}  canaux ${lyre.dmxChannelStart}–${lyre.dmxChannelEnd}`
      );
    });
  }

  console.log("\n=== Mur LED (exemple) ===");
  console.log("  entité 100  →  192.168.1.45  univers 0  canal 1");
  console.log("  entité 15100 →  192.168.1.48  univers 0  canal 1");
}

module.exports = {
  loadConfig,
  saveConfig,
  validateConfig,
  getControllers,
  getProjector,
  getLyres,
  printInstallInfo,
};
