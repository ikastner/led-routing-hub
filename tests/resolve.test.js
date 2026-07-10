const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig } = require("../src/core/config");
const { resolveEntity, resolveLyre, resolveProjector } = require("../src/core/resolve");

describe("resolve", () => {
  const config = loadConfig();
  const { segments } = config;

  it("entité 100 → quart gauche", () => {
    const t = resolveEntity(100, segments);
    assert.ok(t);
    assert.equal(t.controllerIp, "192.168.1.45");
    assert.equal(t.universe, 0);
    assert.equal(t.dmxChannel, 1);
  });

  it("entité 15100 → quart droit", () => {
    const t = resolveEntity(15100, segments);
    assert.ok(t);
    assert.equal(t.controllerIp, "192.168.1.48");
  });

  it("projecteur RGBW entité 1", () => {
    const t = resolveProjector(config);
    assert.equal(t.type, "rgbw");
    assert.equal(t.universe, 33);
  });

  it("lyres 1–4", () => {
    for (let i = 1; i <= 4; i += 1) {
      const lyre = resolveLyre(i, config);
      assert.equal(lyre.controllerIp, "192.168.1.48");
      assert.equal(lyre.universe, 33);
    }
  });
});
