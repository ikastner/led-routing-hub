#!/usr/bin/env node

const { loadConfig, printInstallInfo } = require("../src/core/config");
const { createBufferManager } = require("../src/core/dmxBuffers");
const { startStateReceiver } = require("../src/core/stateReceiver");
const { startSenderLoop } = require("../src/core/senderLoop");
const { startWatchdog } = require("../src/core/watchdog");
const { blackoutAll } = require("../src/core/blackout");
const { STATE_PORT } = require("../src/core/protocol");

function parseArgs(argv) {
  const args = { port: STATE_PORT, hz: 40, dryRun: false, watchdogMs: 2000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port" && argv[i + 1]) args.port = parseInt(argv[++i], 10);
    else if (arg === "--hz" && argv[i + 1]) args.hz = parseFloat(argv[++i]);
    else if (arg === "--watchdog" && argv[i + 1]) args.watchdogMs = parseInt(argv[++i], 10);
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node tools/router-cli.js [--port 6455] [--hz 40] [--dry-run]");
    return;
  }

  const config = loadConfig();
  printInstallInfo(config);

  const bufferManager = createBufferManager(config);
  console.log(`\n[router] ${bufferManager.size} buffers DMX`);

  const receiver = startStateReceiver(bufferManager, { port: args.port });
  await receiver.ready;

  const sender = startSenderLoop(bufferManager, { hz: args.hz, dryRun: args.dryRun });
  const watchdog = startWatchdog(bufferManager, receiver, { timeoutMs: args.watchdogMs });

  console.log(`[router] actif — lancez le faker : npm run faker`);
  console.log(`[router] Ctrl+C pour arrêter\n`);

  let stopping = false;
  const shutdown = async () => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log("\n[router] arrêt + blackout…");
    watchdog.stop();
    sender.stop();
    receiver.stop();
    if (!args.dryRun) {
      try {
        await blackoutAll(config, { repeat: 8, hz: 40 });
      } catch (err) {
        console.error(`[router] blackout échoué : ${err.message}`);
      }
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
