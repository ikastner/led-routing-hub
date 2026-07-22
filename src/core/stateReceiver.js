/**
 * Réception UDP LEDS + DEVS → bufferManager.
 */

const dgram = require("dgram");
const {
  LED_MAGIC,
  DEVS_MAGIC,
  STATE_PORT,
  isNewerFrame,
  isSameOrNewerFrame,
  readMagic,
  parseLedsChunkHeader,
  applyLedsChunkColors,
  decodeDevsState,
} = require("./protocol");

/**
 * Silence au-delà de ce seuil = nouvelle session authoring.
 * 250 ms >> intervalle 40 Hz (~25 ms), << watchdog blackout (2 s).
 */
const SESSION_GAP_MS = 250;

function startStateReceiver(
  bufferManager,
  { port = STATE_PORT, sessionGapMs = SESSION_GAP_MS, onStats } = {},
) {
  const sock = dgram.createSocket("udp4");
  let lastPacketAt = Date.now();
  let ledFrameId = null;
  let deviceFrameId = null;
  let packetCount = 0;
  let ledApplied = 0;
  let deviceApplied = 0;
  let lastLogAt = Date.now();

  function resetFrameCounters() {
    ledFrameId = null;
    deviceFrameId = null;
  }

  function emitStats() {
    const stats = {
      packetCount,
      ledApplied,
      deviceApplied,
      ledFrameId,
      deviceFrameId,
      lastPacketAt,
    };
    if (onStats) onStats(stats);
    return stats;
  }

  function maybeLog() {
    const now = Date.now();
    if (now - lastLogAt < 1000) return;
    console.log(
      `[receiver] ${packetCount} pkt/s | LED frame=${ledFrameId ?? "-"} (${ledApplied}) | DEVS frame=${deviceFrameId ?? "-"} (${deviceApplied})`,
    );
    packetCount = 0;
    ledApplied = 0;
    deviceApplied = 0;
    lastLogAt = now;
    emitStats();
  }

  function handleLeds(buffer) {
    const meta = parseLedsChunkHeader(buffer);
    if (!isSameOrNewerFrame(meta.frameId, ledFrameId)) return;

    if (ledFrameId == null || isNewerFrame(meta.frameId, ledFrameId)) {
      ledFrameId = meta.frameId;
    }

    applyLedsChunkColors(buffer, meta.startEntityId, meta.entryCount, (entityId, r, g, b) => {
      if (bufferManager.setEntityColor(entityId, r, g, b)) {
        ledApplied += 1;
      }
    });
  }

  function handleDevs(buffer) {
    const state = decodeDevsState(buffer);
    if (!isSameOrNewerFrame(state.frameId, deviceFrameId)) return;

    if (deviceFrameId == null || isNewerFrame(state.frameId, deviceFrameId)) {
      deviceFrameId = state.frameId;
    }

    for (const device of state.devices) {
      if (
        bufferManager.setDevice(device.deviceId, {
          pan: device.pan,
          panFine: device.panFine,
          tilt: device.tilt,
          tiltFine: device.tiltFine,
          dimmer: device.dimmer,
          shutter: device.shutter,
          colorWheel: device.colorWheel,
          r: device.r,
          g: device.g,
          b: device.b,
          w: device.w,
          moveSpeed: device.moveSpeed,
          function: device.function,
        })
      ) {
        deviceApplied += 1;
      }
    }
  }

  sock.on("message", (buffer) => {
    const now = Date.now();
    if (now - lastPacketAt >= sessionGapMs) {
      resetFrameCounters();
    }
    lastPacketAt = now;
    packetCount += 1;

    try {
      const magic = readMagic(buffer);
      if (magic === LED_MAGIC) handleLeds(buffer);
      else if (magic === DEVS_MAGIC) handleDevs(buffer);
    } catch (err) {
      console.error(`[receiver] paquet ignoré : ${err.message}`);
    }

    maybeLog();
  });

  sock.on("error", (err) => {
    console.error(`[receiver] erreur socket : ${err.message}`);
  });

  const bindPromise = new Promise((resolve, reject) => {
    sock.bind(port, () => {
      const addr = sock.address();
      console.log(`[receiver] écoute UDP :${addr.port} (LEDS + DEVS)`);
      resolve(addr);
    });
    sock.once("error", reject);
  });

  return {
    ready: bindPromise,
    getPort() {
      try {
        return sock.address().port;
      } catch {
        return null;
      }
    },
    getLastPacketAt() {
      return lastPacketAt;
    },
    getStats: emitStats,
    resetFrameCounters,
    stop() {
      sock.close();
    },
  };
}

module.exports = {
  SESSION_GAP_MS,
  startStateReceiver,
};
