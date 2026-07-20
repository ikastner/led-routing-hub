const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const { loadConfig } = require("../src/core/config");
const { murLedToWallBands } = require("../src/core/wallBands");

const STUDIO_WALL_BANDS = path.resolve(
  __dirname,
  "../../led-studio-editor/src/config/wall-bands.json",
);

describe("murLedToWallBands", () => {
  const config = loadConfig();
  const wallBands = murLedToWallBands(config, {
    generatedFrom: config.generatedFrom,
  });

  it("produit 128 colonnes / bandes rgb", () => {
    assert.equal(wallBands.columns, 128);
    assert.equal(wallBands.bands.length, 128);
  });

  it("totalise 16576 entités LED", () => {
    const total = wallBands.bands.reduce((sum, b) => sum + b.entityCount, 0);
    assert.equal(total, 16576);
  });

  it("première bande = entityStart 100, count 170", () => {
    assert.equal(wallBands.bands[0].column, 0);
    assert.equal(wallBands.bands[0].entityStart, 100);
    assert.equal(wallBands.bands[0].entityCount, 170);
  });

  it("match le wall-bands.json du studio (0 mismatch)", () => {
    if (!fs.existsSync(STUDIO_WALL_BANDS)) {
      console.log("  (skip) led-studio-editor wall-bands.json absent");
      return;
    }
    const studio = JSON.parse(fs.readFileSync(STUDIO_WALL_BANDS, "utf-8"));
    assert.equal(wallBands.columns, studio.columns);
    assert.equal(wallBands.bands.length, studio.bands.length);
    for (let i = 0; i < studio.bands.length; i += 1) {
      assert.equal(wallBands.bands[i].entityStart, studio.bands[i].entityStart, `band ${i} entityStart`);
      assert.equal(wallBands.bands[i].entityCount, studio.bands[i].entityCount, `band ${i} entityCount`);
    }
  });
});
