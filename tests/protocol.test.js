const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  encodeLedsChunk,
  decodeLedsChunk,
  encodeDevsState,
  decodeDevsState,
  isNewerFrame,
} = require("../src/core/protocol");

describe("protocol", () => {
  it("round-trip LEDS chunk", () => {
    const colors = [{ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }];
    const buf = encodeLedsChunk({
      frameId: 42,
      chunkIndex: 0,
      chunkCount: 2,
      startEntityId: 100,
      colors,
    });
    const decoded = decodeLedsChunk(buf);
    assert.equal(decoded.frameId, 42);
    assert.equal(decoded.startEntityId, 100);
    assert.equal(decoded.colors.length, 2);
    assert.deepEqual(decoded.colors[0], { r: 255, g: 0, b: 0 });
  });

  it("round-trip DEVS", () => {
    const buf = encodeDevsState({
      frameId: 7,
      devices: [{ deviceId: 0, r: 10, g: 20, b: 30, w: 40 }],
    });
    const decoded = decodeDevsState(buf);
    assert.equal(decoded.frameId, 7);
    assert.equal(decoded.devices[0].deviceId, 0);
    assert.equal(decoded.devices[0].r, 10);
    assert.equal(decoded.devices[0].w, 40);
  });

  it("frameId modulo", () => {
    assert.equal(isNewerFrame(1, 65535), true);
    assert.equal(isNewerFrame(65535, 1), false);
  });
});
