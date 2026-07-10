#!/usr/bin/env node

const { loadConfig, validateConfig } = require("../src/core/config");

const config = loadConfig();
const errors = validateConfig(config);

if (errors.length) {
  console.error("Config invalide :");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("Config OK");
console.log(`  ${config.controllers.length} contrôleurs`);
console.log(`  ${config.segments.length} segments`);
console.log(`  ${config.stats?.ledEntityCount ?? "?"} entités LED`);
