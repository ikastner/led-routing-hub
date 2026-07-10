const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { buildArtDmx, emptyPayload, setRgb } = require("../src/core/artnet");

describe("artnet", () => {
  it("construit un paquet ArtDmx valide", () => {
    const payload = emptyPayload();
    setRgb(payload, 1, 255, 0, 0);
    const packet = buildArtDmx(0, payload, 1);
    assert.equal(packet.toString("ascii", 0, 8).replace(/\0/g, ""), "Art-Net");
    assert.equal(packet.readUInt16LE(8), 0x5000);
    assert.equal(packet.readUInt8(14), 0);
  });
});
