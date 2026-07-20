#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { parseEcran, MAPPING_PATH } = require("../src/core/parseEcran");
const { saveConfig } = require("../src/core/config");
const { ensureMigrated, getActiveProfile } = require("../src/core/profiles");

function main() {
  ensureMigrated();
  const active = getActiveProfile();
  const xlsxArg = process.argv[2];
  const outArg = process.argv[3];

  const xlsxPath = xlsxArg && xlsxArg.endsWith(".xlsx") ? path.resolve(xlsxArg) : MAPPING_PATH;
  const out = outArg ?? (xlsxArg && !xlsxArg.endsWith(".xlsx") ? xlsxArg : active.configPath);

  console.log(`Parse ${xlsxPath}…`);
  const config = parseEcran(xlsxPath);

  if (out === active.configPath) {
    saveConfig(config);
    console.log(`Écrit profil actif « ${active.id} » → ${active.configPath}`);
    console.log(`Écrit ${active.wallBandsPath}`);
  } else {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(config, null, 2)}\n`);
    console.log(`Écrit ${out}`);
  }
  console.log(`  ${config.stats.ledBandCount} bandes, ${config.stats.ledEntityCount} entités LED`);
}

if (require.main === module) {
  main();
}

module.exports = { parseEcran };
