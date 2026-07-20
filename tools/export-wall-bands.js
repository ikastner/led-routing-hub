#!/usr/bin/env node

const path = require("path");
const { loadConfig } = require("../src/core/config");
const { WALL_BANDS_PATH } = require("../src/core/paths");
const { deriveAndWriteWallBands } = require("../src/core/wallBands");

function main() {
  const out = process.argv[2] ?? WALL_BANDS_PATH;
  const config = loadConfig();
  const wallBands = deriveAndWriteWallBands(config, out, {
    generatedFrom: config.generatedFrom ?? "config/mur-led.json",
  });
  console.log(`Écrit ${path.resolve(out)}`);
  console.log(`  columns=${wallBands.columns}, bands=${wallBands.bands.length}`);
  const entities = wallBands.bands.reduce((sum, b) => sum + b.entityCount, 0);
  console.log(`  entities=${entities}`);
}

main();
