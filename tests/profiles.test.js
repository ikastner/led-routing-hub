const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const {
  ensureMigrated,
  listProfiles,
  getActiveProfile,
  setActiveProfile,
  createProfile,
  deleteProfile,
  DEFAULT_PROFILE_ID,
} = require("../src/core/profiles");
const { loadConfig } = require("../src/core/config");
const { PROJECT_ROOT } = require("../src/core/paths");

describe("profiles (config projet)", () => {
  const tmpId = `p1-test-${Date.now().toString(36)}`;
  let previousActive;

  before(() => {
    ensureMigrated();
    previousActive = getActiveProfile().id;
  });

  after(() => {
    try {
      if (listProfiles().some((p) => p.id === tmpId)) {
        if (getActiveProfile().id === tmpId) {
          setActiveProfile(previousActive || DEFAULT_PROFILE_ID);
        }
        deleteProfile(tmpId);
      }
    } catch {
      /* ignore cleanup */
    }
    try {
      setActiveProfile(previousActive || DEFAULT_PROFILE_ID);
    } catch {
      /* ignore */
    }
  });

  it("migrate / default existe avec mur-led.json", () => {
    const active = ensureMigrated();
    assert.ok(fs.existsSync(active.configPath), "configPath manquant");
    const profiles = listProfiles();
    assert.ok(profiles.some((p) => p.id === DEFAULT_PROFILE_ID));
  });

  it("deux profils coexistent ; activer change le mapping chargé", () => {
    const created = createProfile({ id: tmpId, label: "P1 Test", fromActive: true });
    assert.equal(created.id, tmpId);

    const profiles = listProfiles();
    assert.ok(profiles.some((p) => p.id === DEFAULT_PROFILE_ID));
    assert.ok(profiles.some((p) => p.id === tmpId));

    setActiveProfile(tmpId);
    assert.equal(getActiveProfile().id, tmpId);
    const cfgA = loadConfig();
    assert.ok(cfgA.controllers?.length);

    // Muter légèrement le profil test (entityStart première bande rgb)
    const firstRgb = cfgA.segments.find((s) => s.type === "rgb");
    assert.ok(firstRgb);
    const originalStart = firstRgb.entityStart;
    firstRgb.entityStart = originalStart + 1;
    fs.writeFileSync(
      getActiveProfile().configPath,
      `${JSON.stringify(cfgA, null, 2)}\n`,
      "utf-8",
    );

    setActiveProfile(DEFAULT_PROFILE_ID);
    const cfgDefault = loadConfig();
    const defaultStart = cfgDefault.segments.find((s) => s.type === "rgb").entityStart;
    assert.equal(defaultStart, originalStart);

    setActiveProfile(tmpId);
    const cfgTest = loadConfig();
    assert.equal(
      cfgTest.segments.find((s) => s.type === "rgb").entityStart,
      originalStart + 1,
    );

    // active.json persiste
    const activeFile = path.join(PROJECT_ROOT, "config", "active.json");
    const disk = JSON.parse(fs.readFileSync(activeFile, "utf-8"));
    assert.equal(disk.profile, tmpId);
  });

  it("refuse de supprimer default ou le profil actif", () => {
    setActiveProfile(tmpId);
    assert.throws(() => deleteProfile(DEFAULT_PROFILE_ID), /default/);
    assert.throws(() => deleteProfile(tmpId), /actif/);
  });
});

describe("profiles migration isolée (sous-processus)", () => {
  it("copie mur-led.json legacy → profiles/default/", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "led-profiles-"));
    const legacyCfg = path.join(PROJECT_ROOT, "config", "mur-led.json");
    const legacyWb = path.join(PROJECT_ROOT, "config", "wall-bands.json");
    assert.ok(fs.existsSync(legacyCfg), "legacy mur-led.json requis pour le test");

    fs.copyFileSync(legacyCfg, path.join(tmp, "mur-led.json"));
    if (fs.existsSync(legacyWb)) {
      fs.copyFileSync(legacyWb, path.join(tmp, "wall-bands.json"));
    }

    const script = `
      const assert = require("node:assert/strict");
      const fs = require("fs");
      const path = require("path");
      const { ensureMigrated, getActiveProfile, listProfiles } = require(${JSON.stringify(
        path.join(PROJECT_ROOT, "src/core/profiles.js"),
      )});
      const active = ensureMigrated();
      assert.equal(active.id, "default");
      assert.ok(fs.existsSync(active.configPath));
      assert.ok(listProfiles().some((p) => p.id === "default" && p.active));
      const activeDisk = JSON.parse(fs.readFileSync(path.join(process.env.LED_CONFIG_DIR, "active.json"), "utf-8"));
      assert.equal(activeDisk.profile, "default");
    `;

    const result = spawnSync(process.execPath, ["-e", script], {
      env: { ...process.env, LED_CONFIG_DIR: tmp },
      encoding: "utf-8",
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
