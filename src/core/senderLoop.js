const path = require("path");
const { Worker } = require("worker_threads");

function startSenderLoop(bufferManager, { hz = 40, dryRun = false, sendAllEvery = 10 } = {}) {
  const workerPath = path.join(__dirname, "senderWorker.js");
  const worker = new Worker(workerPath, { workerData: { hz, dryRun } });

  let interval = null;
  let tickCount = 0;
  let packetsSent = 0;
  let lastLogAt = 0;
  let ticksSinceFullSend = 0;

  worker.on("message", (msg) => {
    if (msg.type === "tick") {
      packetsSent += msg.sent ?? 0;
      bufferManager.clearDirty();
    }
  });

  worker.on("error", (err) => {
    console.error(`[sender] worker error: ${err.message}`);
  });

  function tick() {
    ticksSinceFullSend += 1;
    const forceAll = ticksSinceFullSend >= sendAllEvery;

    let targets = bufferManager.listDirty();
    if (forceAll || targets.length === 0) {
      targets = bufferManager.list();
      ticksSinceFullSend = 0;
    }

    const serialized = targets.map((t) => ({
      ip: t.ip,
      universe: t.universe,
      buffer: Buffer.from(t.buffer),
    }));

    worker.postMessage({ type: "send", targets: serialized });

    tickCount += 1;
    const now = Date.now();
    if (now - lastLogAt >= 1000) {
      console.log(`[sender] ${tickCount} tick(s), ~${packetsSent} paquets ArtNet${dryRun ? " (dry-run)" : ""}`);
      tickCount = 0;
      packetsSent = 0;
      lastLogAt = now;
    }
  }

  interval = setInterval(tick, Math.max(1, Math.round(1000 / hz)));

  return {
    stop() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      worker.postMessage({ type: "stop" });
    },
    getTickCount() {
      return tickCount;
    },
  };
}

module.exports = {
  startSenderLoop,
};
