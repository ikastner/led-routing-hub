const { parentPort, workerData } = require("worker_threads");
const dgram = require("dgram");
const { ARTNET_PORT, buildArtDmx } = require("./artnet");

const { hz = 40, dryRun = false } = workerData;
const sequences = new Map();
let sock = null;

if (!dryRun) {
  sock = dgram.createSocket("udp4");
}

function getSequence(key) {
  const current = sequences.get(key) ?? 0;
  const next = (current % 255) + 1;
  sequences.set(key, next);
  return next;
}

function sendTargets(targets) {
  if (dryRun || targets.length === 0) {
    parentPort.postMessage({ type: "tick", sent: 0 });
    return;
  }

  let pending = targets.length;
  let sent = 0;

  for (const target of targets) {
    const key = `${target.ip}:${target.universe}`;
    const packet = buildArtDmx(target.universe, target.buffer, getSequence(key));
    sock.send(packet, ARTNET_PORT, target.ip, (err) => {
      if (!err) sent += 1;
      pending -= 1;
      if (pending === 0) {
        parentPort.postMessage({ type: "tick", sent });
      }
    });
  }
}

parentPort.on("message", (msg) => {
  if (msg.type === "send") {
    sendTargets(msg.targets);
  } else if (msg.type === "stop") {
    if (sock) sock.close();
    process.exit(0);
  }
});
