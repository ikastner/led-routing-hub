#!/usr/bin/env node
/**
 * Usage :
 *   node tools/create-viewport-profile.js
 *   node tools/create-viewport-profile.js --source salle-b --target demo-32x32 --size 32
 */

const { createViewportProfile } = require("../src/core/createViewportProfile");

function parseArgs(argv) {
  const args = {
    sourceProfileId: "salle-b",
    targetProfileId: "demo-32x32",
    viewportSize: 32,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--source") args.sourceProfileId = argv[++i];
    else if (a === "--target") args.targetProfileId = argv[++i];
    else if (a === "--size") args.viewportSize = Number(argv[++i]);
    else if (a === "--label") args.label = argv[++i];
    else if (a === "--col-start") args.colStart = Number(argv[++i]);
    else if (a === "--origin-row") args.originRow = Number(argv[++i]);
    else if (a === "--xlsx") args.xlsxOut = argv[++i];
  }
  return args;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const result = createViewportProfile(opts);
  console.log(`Profil créé : ${result.profileId}`);
  console.log(`  mur-led     → ${result.configPath}`);
  console.log(`  wall-bands  → ${result.wallBandsPath}`);
  console.log(`  excel       → ${result.xlsxPath}`);
  console.log(
    `  viewport    → ${result.viewport.visibleRows}×${result.viewport.visibleRows}` +
      ` originRow=${result.viewport.originRow}` +
      ` cols ${result.viewport.sourceColumnStart}–${result.viewport.sourceColumnEnd}`,
  );
  console.log(
    `  stats       → ${result.stats.ledBandCount} bandes, ${result.stats.ledEntityCount} entités`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}
