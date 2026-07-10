#!/usr/bin/env node

const dgram = require("dgram");
const { ARTNET_PORT } = require("../src/core/artnet");

const sock = dgram.createSocket("udp4");
let count = 0;
const bySource = new Map();

sock.on("message", (msg, rinfo) => {
  if (msg.length < 18) return;
  const id = msg.toString("ascii", 0, 8).replace(/\0/g, "");
  if (id !== "Art-Net") return;

  count += 1;
  const universe = msg.readUInt8(14) | (msg.readUInt8(15) << 8);
  const key = `${rinfo.address}:${universe}`;
  bySource.set(key, (bySource.get(key) ?? 0) + 1);
});

sock.on("listening", () => {
  const addr = sock.address();
  console.log(`[sniffer] écoute ArtNet sur :${addr.port}`);
  console.log("[sniffer] Ctrl+C pour arrêter\n");
});

setInterval(() => {
  if (count === 0) return;
  console.log(`[sniffer] ${count} paquet(s)/s`);
  for (const [key, n] of [...bySource.entries()].sort()) {
    console.log(`  ${key}  ${n}`);
  }
  count = 0;
  bySource.clear();
}, 1000);

sock.bind(ARTNET_PORT);

process.on("SIGINT", () => {
  sock.close();
  process.exit(0);
});
