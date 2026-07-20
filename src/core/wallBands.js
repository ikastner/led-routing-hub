/**
 * Dérive wall-bands.json (vue authoring) depuis mur-led.json.
 * Contrat : docs/implementation/contrat-authoring.md
 */

const fs = require("fs");
const path = require("path");
const { WALL_BANDS_PATH } = require("./paths");

function murLedToWallBands(config, { profile = null, generatedFrom = null } = {}) {
  const rgbSegments = (config.segments ?? []).filter((seg) => seg.type === "rgb");

  const bands = rgbSegments.map((seg, index) => {
    const entityStart = Number(seg.entityStart);
    const entityCount =
      seg.entityCount != null
        ? Number(seg.entityCount)
        : Number(seg.entityEnd) - entityStart + 1;

    return {
      column: seg.column != null ? Number(seg.column) : index,
      entityStart,
      entityCount,
    };
  });

  const result = {
    columns: bands.length,
    bands,
  };

  if (generatedFrom) result.generatedFrom = generatedFrom;
  if (profile) result.profile = profile;

  return result;
}

function writeWallBands(wallBands, outPath = WALL_BANDS_PATH) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(wallBands, null, 2)}\n`, "utf-8");
  return outPath;
}

function deriveAndWriteWallBands(config, outPath = WALL_BANDS_PATH, options = {}) {
  const wallBands = murLedToWallBands(config, options);
  writeWallBands(wallBands, outPath);
  return wallBands;
}

module.exports = {
  murLedToWallBands,
  writeWallBands,
  deriveAndWriteWallBands,
};
