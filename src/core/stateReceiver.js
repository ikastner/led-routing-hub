/**
Gère la réception des états des entités LED et des devices par UDP et les diffuse sur le bufferManager
pour être utilisés par le reste de l'application pour la gestion des états des entités LED et des devices.
**/

const dgram = require("dgram");
const {
  LED_MAGIC,
  DEVS_MAGIC,
  STATE_PORT,
  isNewerFrame,
  isSameOrNewerFrame,
  readMagic,
  decodeLedsChunk,
  decodeDevsState,
} = require("./protocol");

/**  
  @description : Démarre le receiver des états des entités LED et des devices par UDP et les diffuse sur le bufferManager pour être 
  utilisés par le reste de l'application pour la gestion des états des entités LED et des devices.
 * @param {BufferManager} bufferManager - Le bufferManager pour stocker les états des entités LED et des devices.
 * @param {Object} options - Les options pour le receiver.
 * @param {number} options.port - Le port UDP pour la réception des états des entités LED et des devices.
 * @param {Function} options.onStats - La fonction pour émettre les statistiques.
 * @returns {Object} - L'objet de retour contenant la promesse de prêt et les méthodes pour arrêter le receiver.
 */
function startStateReceiver(bufferManager, { port = STATE_PORT, onStats } = {}) {
  const sock = dgram.createSocket("udp4");
  let lastPacketAt = Date.now();
  let ledFrameId = null;
  let deviceFrameId = null;
  let packetCount = 0;
  let ledApplied = 0;
  let deviceApplied = 0;
  let lastLogAt = Date.now();

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
      `[receiver] ${packetCount} pkt/s | LED frame=${ledFrameId ?? "-"} (${ledApplied}) | DEVS frame=${deviceFrameId ?? "-"} (${deviceApplied})`
    );
    packetCount = 0;
    ledApplied = 0;
    deviceApplied = 0;
    lastLogAt = now;
    emitStats();
  }

  function handleLeds(buffer) {
    const chunk = decodeLedsChunk(buffer);
    if (!isSameOrNewerFrame(chunk.frameId, ledFrameId)) return;

    if (ledFrameId == null || isNewerFrame(chunk.frameId, ledFrameId)) {
      ledFrameId = chunk.frameId;
    }

    for (let i = 0; i < chunk.colors.length; i += 1) {
      const entityId = chunk.startEntityId + i;
      const { r, g, b } = chunk.colors[i];
      if (bufferManager.setEntityColor(entityId, r, g, b)) {
        ledApplied += 1;
      }
    }
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
    lastPacketAt = Date.now();
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
      console.log(`[receiver] écoute UDP :${port} (LEDS + DEVS)`);
      resolve();
    });
    sock.once("error", reject);
  });

  return {
    ready: bindPromise,
    getLastPacketAt() {
      return lastPacketAt;
    },
    getStats: emitStats,
    stop() {
      sock.close();
    },
  };
}

module.exports = {
  startStateReceiver,
};
