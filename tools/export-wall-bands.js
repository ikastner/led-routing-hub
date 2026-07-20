#!/usr/bin/env node

const path = require("path");
const { loadConfig } = require("../src/core/config");
const { ensureMigrated, getActiveProfile } = require("../src/core/profiles");
const { deriveAndWriteWallBands } = require("../src/core/wallBands");

function main() {
  ensureMigrated();
  const active = getActiveProfile();
  const out = process.argv[2] ?? active.wallBandsPath;
  const config = loadConfig();
  const wallBands = deriveAndWriteWallBands(config, out, {
    profile: active.id,
    generatedFrom: config.generatedFrom ?? active.configPath,
  });
  console.log(`Profil actif : ${active.id}`);
  console.log(`Écrit ${path.resolve(out)}`);
  console.log(`  columns=${wallBands.columns}, bands=${wallBands.bands.length}`);
  const entities = wallBands.bands.reduce((sum, b) => sum + b.entityCount, 0);
  console.log(`  entities=${entities}`);
}

main();
