const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig } = require("../src/core/config");
const { createBufferManager } = require("../src/core/dmxBuffers");
const {
  encodeLedsChunk,
  applyLedsChunk,
  parseLedsChunkHeader,
} = require("../src/core/protocol");
const {
  buildArtDmx,
  buildArtDmxInto,
  allocArtDmxPacket,
  emptyPayload,
  setRgb,
} = require("../src/core/artnet");

describe("dmxBuffers", () => {
  const config = loadConfig();
  const mgr = createBufferManager(config);

  it("index entity O(1) couvre le mur + projecteur", () => {
    assert.ok(mgr.getEntityIndexSize() >= 16576);
    assert.equal(mgr.setEntityColor(100, 255, 0, 0), true);
    assert.equal(mgr.setEntityColor(15100, 0, 0, 255), true);
    assert.equal(mgr.setEntityColor(1, 10, 20, 30, 40), true);
  });

  it("écrit entité 100 en rouge", () => {
    assert.equal(mgr.setEntityColor(100, 255, 0, 0), true);
    const targets = mgr.list();
    const entry = targets.find((t) => t.ip === "192.168.1.45" && t.universe === 0);
    assert.ok(entry);
    assert.equal(entry.buffer[0], 255);
    assert.equal(entry.buffer[1], 0);
    assert.equal(entry.buffer[2], 0);
  });

  it("takeDirty snapshot + clear synchrone", () => {
    mgr.clearDirty();
    mgr.setEntityColor(100, 0, 255, 0);
    const taken = mgr.takeDirty();
    assert.ok(taken.length >= 1);
    assert.equal(mgr.listDirty().length, 0);
  });

  it("dirty flags via listDirty", () => {
    mgr.clearDirty();
    mgr.setEntityColor(100, 0, 255, 0);
    assert.ok(mgr.listDirty().length > 0);
  });

  it("lyre shutter authoring 40 → DMX 255 (pas strobe)", () => {
    const { SHUTTER_OPEN, SHUTTER_DMX_OPEN, CHANNELS } = require("../src/core/lyre");
    mgr.clearDirty();
    assert.equal(
      mgr.setDevice(1, {
        pan: 200,
        tilt: 50,
        dimmer: 255,
        shutter: SHUTTER_OPEN,
        colorWheel: 80,
        r: 255,
        g: 10,
        b: 20,
      }),
      true,
    );
    const entry = mgr.list().find((t) => t.ip === "192.168.1.48" && t.universe === 33);
    assert.ok(entry);
    const dmxStart = 10; // Lyre 1
    assert.equal(entry.buffer[dmxStart + CHANNELS.shutter - 1], SHUTTER_DMX_OPEN);
    // pan/tilt croisés : auth pan→DMX tilt, auth tilt→DMX pan
    assert.equal(entry.buffer[dmxStart + CHANNELS.pan - 1], 50);
    assert.equal(entry.buffer[dmxStart + CHANNELS.tilt - 1], 200);
    assert.equal(entry.buffer[dmxStart + CHANNELS.r - 1], 255);
    assert.equal(entry.buffer[dmxStart + CHANNELS.g - 1], 10);
    assert.equal(entry.buffer[dmxStart + CHANNELS.b - 1], 20);
  });

  it("projecteur shutter 0 → RGBW éteint", () => {
    mgr.setDevice(0, {
      dimmer: 255,
      shutter: 0,
      r: 255,
      g: 128,
      b: 64,
      w: 32,
    });
    const entry = mgr.list().find((t) => t.ip === "192.168.1.48" && t.universe === 33);
    assert.ok(entry);
    assert.equal(entry.buffer[0], 0);
    assert.equal(entry.buffer[1], 0);
    assert.equal(entry.buffer[2], 0);
    assert.equal(entry.buffer[3], 0);
  });
});

describe("artnet in-place", () => {
  it("buildArtDmxInto remplit un paquet préalloué", () => {
    const payload = emptyPayload();
    setRgb(payload, 1, 255, 0, 0);
    const pkt = allocArtDmxPacket();
    buildArtDmxInto(pkt, 0, payload, 1);
    assert.equal(pkt.toString("ascii", 0, 8).replace(/\0/g, ""), "Art-Net");
    assert.equal(pkt.readUInt16LE(8), 0x5000);
    assert.equal(pkt.readUInt8(12), 1);
    assert.equal(pkt.readUInt8(14), 0);
    assert.equal(pkt[18], 255);
  });

  it("buildArtDmx reste compatible", () => {
    const payload = emptyPayload();
    setRgb(payload, 1, 255, 0, 0);
    const packet = buildArtDmx(0, payload, 1);
    assert.equal(packet.toString("ascii", 0, 8).replace(/\0/g, ""), "Art-Net");
    assert.equal(packet.readUInt16LE(8), 0x5000);
  });
});

describe("applyLedsChunk sans objets couleur", () => {
  it("applique RGB via callback", () => {
    const colors = [
      { r: 1, g: 2, b: 3 },
      { r: 4, g: 5, b: 6 },
    ];
    const buf = encodeLedsChunk({
      frameId: 7,
      chunkIndex: 0,
      chunkCount: 1,
      startEntityId: 100,
      colors,
    });
    const meta = parseLedsChunkHeader(buf);
    assert.equal(meta.frameId, 7);
    assert.equal(meta.entryCount, 2);

    const seen = [];
    applyLedsChunk(buf, (id, r, g, b) => seen.push({ id, r, g, b }));
    assert.deepEqual(seen, [
      { id: 100, r: 1, g: 2, b: 3 },
      { id: 101, r: 4, g: 5, b: 6 },
    ]);
  });
});
