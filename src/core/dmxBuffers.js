/**
 * Gère les buffers DMX pour les entités LED et les devices.
 * Hot path : index entityId → { entry, channel, type } en O(1).
 */

const { listUniverses } = require("./blackout");
const { resolveEntity, resolveLyre } = require("./resolve");
const { setChannel, setRgb, setRgbw } = require("./artnet");
const { CHANNELS, mapAuthoringShutterToDmx } = require("./lyre");

function bufferKey(ip, universe) {
  return `${ip}:${universe}`;
}

/**
 * Précalcule entityId → slot DMX (une fois au load config).
 * @returns {Map<number, { entry, channel: number, type: string }>}
 */
function buildEntityIndex(segments, entries) {
  const index = new Map();

  for (const seg of segments ?? []) {
    if (seg.type === "rgb") {
      const entry = entries.get(bufferKey(seg.controllerIp, seg.universe));
      if (!entry) continue;
      const channelsPer = seg.channelsPerEntity ?? 3;
      const startCh = seg.dmxChannelStart ?? 1;
      for (let id = seg.entityStart; id <= seg.entityEnd; id += 1) {
        const pixelIndex = id - seg.entityStart;
        index.set(id, {
          entry,
          channel: startCh + pixelIndex * channelsPer,
          type: "rgb",
        });
      }
    } else if (seg.type === "rgbw") {
      const entry = entries.get(bufferKey(seg.controllerIp, seg.universe));
      if (!entry) continue;
      index.set(seg.entityStart, {
        entry,
        channel: seg.dmxChannelStart ?? 1,
        type: "rgbw",
      });
    }
  }

  return index;
}

function createBufferManager(config) {
  const segments = config.segments;
  const entries = new Map();
  const dirty = new Set();

  for (const target of listUniverses(config)) {
    entries.set(bufferKey(target.ip, target.universe), {
      ip: target.ip,
      universe: target.universe,
      label: target.label,
      buffer: Buffer.alloc(512, 0),
    });
  }

  const entityIndex = buildEntityIndex(segments, entries);

  function markDirty(ip, universe) {
    dirty.add(bufferKey(ip, universe));
  }

  function markEntryDirty(entry) {
    dirty.add(bufferKey(entry.ip, entry.universe));
  }

  function getEntry(ip, universe) {
    return entries.get(bufferKey(ip, universe));
  }

  function setEntityColor(entityId, r, g, b, w = 0) {
    const slot = entityIndex.get(entityId);
    if (!slot) return false;

    const { entry, channel, type } = slot;
    if (type === "rgbw") {
      setRgbw(entry.buffer, channel, r, g, b, w);
    } else {
      setRgb(entry.buffer, channel, r, g, b);
    }
    markEntryDirty(entry);
    return true;
  }

  function applyProjectorRgbw(entry, channel, channels) {
    const shutter = channels.shutter ?? 0;
    // Aligné preview Unity : shutter 0 → éteint (même si dimmer/RGB non nuls)
    if (shutter === 0) {
      setRgbw(entry.buffer, channel, 0, 0, 0, 0);
      markEntryDirty(entry);
      return true;
    }
    const scale = (channels.dimmer ?? 255) / 255;
    setRgbw(
      entry.buffer,
      channel,
      Math.round((channels.r ?? 0) * scale),
      Math.round((channels.g ?? 0) * scale),
      Math.round((channels.b ?? 0) * scale),
      Math.round((channels.w ?? 0) * scale),
    );
    markEntryDirty(entry);
    return true;
  }

  function setDevice(deviceId, channels) {
    if (deviceId === 0) {
      const slot = entityIndex.get(1);
      if (!slot || slot.type !== "rgbw") {
        const target = resolveEntity(1, segments);
        if (!target || target.type !== "rgbw") return false;
        const entry = getEntry(target.controllerIp, target.universe);
        if (!entry) return false;
        return applyProjectorRgbw(entry, target.dmxChannel, channels);
      }
      return applyProjectorRgbw(slot.entry, slot.channel, channels);
    }

    if (deviceId < 1 || deviceId > 4) return false;

    const lyre = resolveLyre(deviceId, config);
    const entry = getEntry(lyre.controllerIp, lyre.universe);
    if (!entry) return false;

    const base = lyre.dmxChannelStart;
    // Axes fixture Glassworks : le canal « pan » DMX correspond au mouvement
    // vertical vu en salle, et « tilt » à l’horizontal authoring → on croise.
    const authPan = channels.pan ?? 0;
    const authPanFine = channels.panFine ?? 0;
    const authTilt = channels.tilt ?? 0;
    const authTiltFine = channels.tiltFine ?? 0;
    setChannel(entry.buffer, base + CHANNELS.pan, authTilt);
    setChannel(entry.buffer, base + CHANNELS.panFine, authTiltFine);
    setChannel(entry.buffer, base + CHANNELS.tilt, authPan);
    setChannel(entry.buffer, base + CHANNELS.tiltFine, authPanFine);
    setChannel(entry.buffer, base + CHANNELS.dimmer, channels.dimmer ?? 0);
    setChannel(
      entry.buffer,
      base + CHANNELS.shutter,
      mapAuthoringShutterToDmx(channels.shutter),
    );
    setChannel(entry.buffer, base + CHANNELS.colorWheel, channels.colorWheel ?? channels.colorMacro ?? 0);
    // RGB authoring (couleurs distinctes) — plus de force G/B=0
    setChannel(entry.buffer, base + CHANNELS.r, channels.r ?? 0);
    setChannel(entry.buffer, base + CHANNELS.g, channels.g ?? 0);
    setChannel(entry.buffer, base + CHANNELS.b, channels.b ?? 0);
    markEntryDirty(entry);
    return true;
  }

  function blackoutAll() {
    for (const entry of entries.values()) {
      entry.buffer.fill(0);
      markEntryDirty(entry);
    }
  }

  function list() {
    return Array.from(entries.values());
  }

  /** O(dirty) — itère le Set, pas toute la Map. */
  function listDirty() {
    if (dirty.size === 0) return [];
    const out = [];
    for (const key of dirty) {
      const entry = entries.get(key);
      if (entry) out.push(entry);
    }
    return out;
  }

  /**
   * Snapshot des entries dirty + clear synchrone (avant envoi ArtNet).
   */
  function takeDirty() {
    if (dirty.size === 0) return [];
    const out = listDirty();
    dirty.clear();
    return out;
  }

  function clearDirty() {
    dirty.clear();
  }

  function markAllDirty() {
    for (const entry of entries.values()) {
      dirty.add(bufferKey(entry.ip, entry.universe));
    }
  }

  function getSnapshot(ip, universe) {
    const entry = getEntry(ip, universe);
    if (!entry) return null;
    return Buffer.from(entry.buffer);
  }

  return {
    setEntityColor,
    setDevice,
    blackoutAll,
    list,
    listDirty,
    takeDirty,
    clearDirty,
    markAllDirty,
    getSnapshot,
    getEntityIndexSize() {
      return entityIndex.size;
    },
    get size() {
      return entries.size;
    },
  };
}

module.exports = {
  createBufferManager,
  bufferKey,
  buildEntityIndex,
};
