/**
 * Boucle d'envoi ArtNet 40 Hz — même process, paquets préalloués (double buffer).
 * Politique : dirty d'abord ; full refresh tous les sendAllEvery ticks.
 */

const dgram = require("dgram");
const {
  ARTNET_PORT,
  allocArtDmxPacket,
  buildArtDmxInto,
} = require("./artnet");

function startSenderLoop(bufferManager, { hz = 40, dryRun = false, sendAllEvery = 10 } = {}) {
  const sock = dryRun ? null : dgram.createSocket("udp4");
  const sequences = new Map();
  /** @type {Map<string, { bufs: Buffer[], flip: number }>} */
  const packetPools = new Map();

  let interval = null;
  let tickCount = 0;
  let packetsSent = 0;
  let lastLogAt = 0;
  let ticksSinceFullSend = 0;

  function getSequence(key) {
    const current = sequences.get(key) ?? 0;
    const next = (current % 255) + 1;
    sequences.set(key, next);
    return next;
  }

  function getPacketPair(key) {
    let pair = packetPools.get(key);
    if (!pair) {
      pair = { bufs: [allocArtDmxPacket(), allocArtDmxPacket()], flip: 0 };
      packetPools.set(key, pair);
    }
    return pair;
  }

  function sendTargets(targets) {
    if (targets.length === 0) return 0;
    if (dryRun) return targets.length;

    let sent = 0;
    for (const target of targets) {
      const key = `${target.ip}:${target.universe}`;
      const pair = getPacketPair(key);
      const pkt = pair.bufs[pair.flip];
      pair.flip ^= 1;

      const seq = getSequence(key);
      buildArtDmxInto(pkt, target.universe, target.buffer, seq);
      sock.send(pkt, ARTNET_PORT, target.ip, (err) => {
        if (err) {
          console.error(`[sender] send ${key} : ${err.message}`);
        }
      });
      sent += 1;
    }
    return sent;
  }

  function tick() {
    ticksSinceFullSend += 1;
    const forceAll = ticksSinceFullSend >= sendAllEvery;

    let targets;
    if (forceAll) {
      bufferManager.clearDirty();
      targets = bufferManager.list();
      ticksSinceFullSend = 0;
    } else {
      targets = bufferManager.takeDirty();
      if (targets.length === 0) {
        targets = bufferManager.list();
        ticksSinceFullSend = 0;
      }
    }

    packetsSent += sendTargets(targets);

    tickCount += 1;
    const now = Date.now();
    if (now - lastLogAt >= 1000) {
      console.log(
        `[sender] ${tickCount} tick(s), ~${packetsSent} paquets ArtNet${dryRun ? " (dry-run)" : ""}`,
      );
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
      if (sock) {
        try {
          sock.close();
        } catch {
          /* ignore */
        }
      }
    },
    getTickCount() {
      return tickCount;
    },
  };
}

module.exports = {
  startSenderLoop,
};
