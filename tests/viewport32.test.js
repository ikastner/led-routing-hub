const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const { parseEcran } = require("../src/core/parseEcran");
const { validateConfig } = require("../src/core/config");
const { murLedToWallBands } = require("../src/core/wallBands");
const { createViewportProfile } = require("../src/core/createViewportProfile");
const { PROJECT_ROOT, PROFILES_DIR } = require("../src/core/paths");

describe("viewport 32×32", () => {
  const xlsx32 = path.join(PROJECT_ROOT, "mapping", "Ecran-32x32.xlsx");
  const profileDir = path.join(PROFILES_DIR, "demo-32x32");

  it("profil demo-32x32 existe avec viewport centré", () => {
    assert.ok(fs.existsSync(path.join(profileDir, "mur-led.json")));
    assert.ok(fs.existsSync(path.join(profileDir, "wall-bands.json")));
    const mur = JSON.parse(fs.readFileSync(path.join(profileDir, "mur-led.json"), "utf-8"));
    assert.equal(mur.viewport.visibleRows, 32);
    assert.equal(mur.viewport.originRow, 48);
    assert.equal(mur.viewport.sourceColumnStart, 48);
    assert.equal(mur.viewport.sourceColumnEnd, 79);
    assert.equal(mur.stats.ledBandCount, 32);
  });

  it("wall-bands propage visibleRows / originRow", () => {
    const mur = JSON.parse(fs.readFileSync(path.join(profileDir, "mur-led.json"), "utf-8"));
    const wb = murLedToWallBands(mur, { profile: "demo-32x32" });
    assert.equal(wb.columns, 32);
    assert.equal(wb.visibleRows, 32);
    assert.equal(wb.originRow, 48);
    assert.equal(wb.bands[0].entityStart, 7500);
  });

  it("parse Ecran-32x32.xlsx → 32 bandes valides", () => {
    assert.ok(fs.existsSync(xlsx32), "Excel 32×32 manquant — npm run create:viewport");
    const config = parseEcran(xlsx32);
    assert.equal(config.stats.ledBandCount, 32);
    assert.equal(config.stats.ledEntityCount, 4144);
    assert.deepEqual(validateConfig(config), []);
  });

  it("createViewportProfile est idempotent", () => {
    const result = createViewportProfile({
      sourceProfileId: "salle-b",
      targetProfileId: "demo-32x32",
      viewportSize: 32,
    });
    assert.equal(result.profileId, "demo-32x32");
    assert.equal(result.viewport.originRow, 48);
    assert.equal(result.stats.ledBandCount, 32);
  });
});
