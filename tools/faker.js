#!/usr/bin/env node

const dgram = require("dgram");
const { loadConfig } = require("../src/core/config");
const { getLyres } = require("../src/core/config");
const { parseColor } = require("../src/core/artnet");
const { CENTER, SHUTTER_OPEN, DIMMER_FULL } = require("../src/core/lyre");
const {
  STATE_PORT,
  encodeLedsChunk,
  encodeDevsState,
  getAllLedChunks,
} = require("../src/core/protocol");

function parseArgs(argv) {
  const args = {
    host: "127.0.0.1",
    port: STATE_PORT,
    hz: 40,
    duration: null,
    color: null,
    pattern: "rainbow",
    devices: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--host" && argv[i + 1]) args.host = argv[++i];
    else if (arg === "--port" && argv[i + 1]) args.port = parseInt(argv[++i], 10);
    else if (arg === "--hz" && argv[i + 1]) args.hz = parseFloat(argv[++i]);
    else if (arg === "--duration" && argv[i + 1]) args.duration = parseFloat(argv[++i]);
    else if (arg === "--color" && argv[i + 1]) args.color = argv[++i];
    else if (arg === "--pattern" && argv[i + 1]) args.pattern = argv[++i];
    else if (arg === "--no-devices") args.devices = false;
    else if (arg === "--help" || arg === "-h") args.help = true;
  }

  return args;
}

function hsvToRgb(h) {
  const s = 1;
  const v = 1;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

function colorForEntity(entityId, frameId, args) {
  if (args.color) {
    const [r, g, b] = parseColor(args.color, 3);
    return { r, g, b };
  }
  if (args.pattern === "rainbow") {
    const hue = (entityId * 0.7 + frameId * 4) % 360;
    return hsvToRgb(hue);
  }
  return { r: 255, g: 0, b: 0 };
}

function parseOptionalRgbw(value) {
  const parts = value.split(",").map((p) => Math.max(0, Math.min(255, parseInt(p.trim(), 10))));
  if ((parts.length === 3 || parts.length === 4) && parts.every((n) => !Number.isNaN(n))) {
    return { r: parts[0], g: parts[1], b: parts[2], w: parts[3] ?? 0 };
  }
  throw new Error("Couleur attendue : R,G,B ou R,G,B,W (ex. 255,0,0)");
}

function devColorFromArgs(args, deviceId) {
  if (args.color) {
    const { r, g, b, w } = parseOptionalRgbw(args.color);
    return { r, g, b, w: deviceId === 0 ? w : 0 };
  }
  if (deviceId === 0) return { r: 128, g: 64, b: 255, w: 0 };
  return { r: 255, g: 0, b: 0, w: 0 };
}

function buildDevsState(frameId, config, args) {
  const projector = devColorFromArgs(args, 0);
  const devices = [{ deviceId: 0, ...projector }];
  getLyres(config).forEach((_, index) => {
    const deviceId = index + 1;
    const color = devColorFromArgs(args, deviceId);
    devices.push({
      deviceId,
      pan: (CENTER + Math.sin(frameId * 0.05 + deviceId) * 60) & 0xff,
      panFine: 0,
      tilt: (CENTER + Math.cos(frameId * 0.04 + deviceId) * 40) & 0xff,
      tiltFine: 0,
      dimmer: DIMMER_FULL,
      shutter: SHUTTER_OPEN,
      r: color.r,
      g: color.g,
      b: color.b,
      w: color.w,
    });
  });
  return encodeDevsState({ frameId, devices });
}

function sendFrame(sock, host, port, frameId, ledChunks, chunkCount, args, config) {
  for (let i = 0; i < ledChunks.length; i += 1) {
    const chunk = ledChunks[i];
    const colors = [];
    for (let j = 0; j < chunk.entryCount; j += 1) {
      colors.push(colorForEntity(chunk.startEntityId + j, frameId, args));
    }
    sock.send(
      encodeLedsChunk({
        frameId,
        chunkIndex: i,
        chunkCount,
        startEntityId: chunk.startEntityId,
        colors,
      }),
      port,
      host
    );
  }
  if (args.devices) {
    sock.send(buildDevsState(frameId, config, args), port, host);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tools/faker.js [--host 127.0.0.1] [--port 6455] [--hz 40] [--duration N]
      --color R,G,B[,W]  couleur unie (mur + projecteur + lyres)
      --pattern rainbow
      --no-devices`);
    return;
  }

  const config = loadConfig();
  const ledChunks = getAllLedChunks(config);
  const chunkCount = ledChunks.length;

  console.log(`[faker] ${chunkCount} chunks LEDS → ${args.host}:${args.port} @ ${args.hz} Hz`);

  const sock = dgram.createSocket("udp4");
  let frameId = 0;
  let framesSent = 0;
  const startedAt = Date.now();

  const interval = setInterval(() => {
    sendFrame(sock, args.host, args.port, frameId, ledChunks, chunkCount, args, config);
    frameId = (frameId + 1) % 65536;
    framesSent += 1;

    if (args.duration != null && (Date.now() - startedAt) / 1000 >= args.duration) {
      clearInterval(interval);
      sock.close();
      console.log(`[faker] terminé — ${framesSent} frame(s)`);
      process.exit(0);
    }
  }, Math.max(1, Math.round(1000 / args.hz)));

  process.on("SIGINT", () => {
    clearInterval(interval);
    sock.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
