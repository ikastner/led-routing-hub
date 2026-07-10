#!/usr/bin/env node

const { loadConfig } = require("../src/core/config");
const { resolveEntity, formatTarget } = require("../src/core/resolve");
const { emptyPayload, setRgb, setRgbw, parseColor, sendArtDmx } = require("../src/core/artnet");

function parseArgs(argv) {
  const args = { entity: 100, color: "255,0,0", dryRun: false, repeat: 20, hz: 25 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--entity" && argv[i + 1]) args.entity = parseInt(argv[++i], 10);
    else if (arg === "--color" && argv[i + 1]) args.color = argv[++i];
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--repeat" && argv[i + 1]) args.repeat = parseInt(argv[++i], 10);
    else if (arg === "--hz" && argv[i + 1]) args.hz = parseFloat(argv[++i]);
    else if (arg === "--help" || arg === "-h") args.help = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node tools/test-led.js --entity 100 --color 255,0,0 [--dry-run]");
    return;
  }

  const config = loadConfig();
  const target = resolveEntity(args.entity, config.segments);
  if (!target) {
    console.error(`Entité ${args.entity} introuvable`);
    process.exit(1);
  }

  console.log(formatTarget(target));

  const [r, g, b] = parseColor(args.color, target.type === "rgbw" ? 4 : 3);
  const payload = emptyPayload();

  if (target.type === "rgbw") {
    setRgbw(payload, target.dmxChannel, r, g, b, parseColor(args.color, 4)[3] ?? 0);
  } else {
    setRgb(payload, target.dmxChannel, r, g, b);
  }

  await sendArtDmx(target.controllerIp, target.universe, payload, {
    repeat: args.repeat,
    hz: args.hz,
    dryRun: args.dryRun,
  });
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
