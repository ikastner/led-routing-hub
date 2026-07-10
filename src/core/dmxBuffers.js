/**
 * Gère les buffers DMX pour les entités LED et les devices.
 * Les buffers sont utilisés pour stocker et gerer les états des entités LED et des devices dans un buffer de 512 octets.
 */

const { listUniverses } = require("./blackout");
const { resolveEntity, resolveLyre } = require("./resolve");
const { setChannel, setRgb, setRgbw } = require("./artnet");
const { CHANNELS } = require("./lyre");

function bufferKey(ip, universe) {
  return `${ip}:${universe}`;
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

  function markDirty(ip, universe) {
    dirty.add(bufferKey(ip, universe));
  }

  function getEntry(ip, universe) {
    return entries.get(bufferKey(ip, universe));
  }

  function setEntityColor(entityId, r, g, b, w = 0) {
    const target = resolveEntity(entityId, segments);
    if (!target) return false;

    const entry = getEntry(target.controllerIp, target.universe);
    if (!entry) return false;

    if (target.type === "rgbw") {
      setRgbw(entry.buffer, target.dmxChannel, r, g, b, w);
    } else {
      setRgb(entry.buffer, target.dmxChannel, r, g, b);
    }
    markDirty(target.controllerIp, target.universe);
    return true;
  }

  function setDevice(deviceId, channels) {
    if (deviceId === 0) {
      const target = resolveEntity(1, segments);
      if (!target || target.type !== "rgbw") return false;
      const entry = getEntry(target.controllerIp, target.universe);
      if (!entry) return false;
      setRgbw(entry.buffer, target.dmxChannel, channels.r ?? 0, channels.g ?? 0, channels.b ?? 0, channels.w ?? 0);
      markDirty(target.controllerIp, target.universe);
      return true;
    }

    if (deviceId < 1 || deviceId > 4) return false;

    const lyre = resolveLyre(deviceId, config);
    const entry = getEntry(lyre.controllerIp, lyre.universe);
    if (!entry) return false;

    const base = lyre.dmxChannelStart;
    setChannel(entry.buffer, base + CHANNELS.pan, channels.pan ?? 0);
    setChannel(entry.buffer, base + CHANNELS.panFine, channels.panFine ?? 0);
    setChannel(entry.buffer, base + CHANNELS.tilt, channels.tilt ?? 0);
    setChannel(entry.buffer, base + CHANNELS.tiltFine, channels.tiltFine ?? 0);
    setChannel(entry.buffer, base + CHANNELS.dimmer, channels.dimmer ?? 0);
    setChannel(entry.buffer, base + CHANNELS.shutter, channels.shutter ?? 0);
    setChannel(entry.buffer, base + CHANNELS.colorWheel, channels.colorWheel ?? channels.colorMacro ?? 0);
    setChannel(entry.buffer, base + CHANNELS.r, channels.r ?? 0);
    setChannel(entry.buffer, base + CHANNELS.g, 0);
    setChannel(entry.buffer, base + CHANNELS.b, 0);
    markDirty(lyre.controllerIp, lyre.universe);
    return true;
  }

  function blackoutAll() {
    for (const entry of entries.values()) {
      entry.buffer.fill(0);
      markDirty(entry.ip, entry.universe);
    }
  }

  function list() {
    return Array.from(entries.values());
  }

  function listDirty() {
    if (dirty.size === 0) return [];
    return list().filter((entry) => dirty.has(bufferKey(entry.ip, entry.universe)));
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
    clearDirty,
    markAllDirty,
    getSnapshot,
    get size() {
      return entries.size;
    },
  };
}

module.exports = {
  createBufferManager,
  bufferKey,
};
