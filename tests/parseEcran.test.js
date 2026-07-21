const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { parseEcran } = require("../src/core/parseEcran");
const { validateConfig } = require("../src/core/config");
const { murLedToWallBands } = require("../src/core/wallBands");
const { PROJECT_ROOT } = require("../src/core/paths");

describe("parseEcran", () => {
  const xlsx = path.join(PROJECT_ROOT, "mapping", "Ecran.xlsx");

  it("parse le template mapping/Ecran.xlsx", () => {
    const config = parseEcran(xlsx);
    assert.equal(config.stats.ledBandCount, 128);
    assert.equal(config.stats.ledEntityCount, 16576);
    assert.equal(config.controllers.length, 4);
    const errors = validateConfig(config);
    assert.deepEqual(errors, []);
  });

  it("produit un wall-bands compatible authoring", () => {
    const config = parseEcran(xlsx);
    const wb = murLedToWallBands(config, { profile: "test" });
    assert.equal(wb.columns, 128);
    assert.equal(wb.bands.length, 128);
    assert.equal(wb.bands[0].entityStart, 100);
  });
});
