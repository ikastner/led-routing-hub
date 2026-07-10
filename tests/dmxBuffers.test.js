const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig } = require("../src/core/config");
const { createBufferManager } = require("../src/core/dmxBuffers");

describe("dmxBuffers", () => {
  const config = loadConfig();
  const mgr = createBufferManager(config);

  it("écrit entité 100 en rouge", () => {
    assert.equal(mgr.setEntityColor(100, 255, 0, 0), true);
    const targets = mgr.list();
    const entry = targets.find((t) => t.ip === "192.168.1.45" && t.universe === 0);
    assert.ok(entry);
    assert.equal(entry.buffer[0], 255);
    assert.equal(entry.buffer[1], 0);
    assert.equal(entry.buffer[2], 0);
  });

  it("dirty flags", () => {
    mgr.clearDirty();
    mgr.setEntityColor(100, 0, 255, 0);
    assert.ok(mgr.listDirty().length > 0);
  });
});
