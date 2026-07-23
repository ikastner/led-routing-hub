/**
 * Crée un profil viewport (ex. 32×32 centré) à partir d’un profil source 128×128.
 * Extrai t les colonnes RGB [colStart, colEnd) + devices, ajoute metadata viewport.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  ensureMigrated,
  getConfigPath,
  getWallBandsPath,
  getMetaPath,
  profileDir,
  sanitizeProfileId,
} = require("./profiles");
const { murLedToWallBands, writeWallBands } = require("./wallBands");
const { validateConfig } = require("./config");
const { PROJECT_ROOT, MAPPING_PATH } = require("./paths");

const DEFAULT_PHYSICAL_ROWS = 128;

/**
 * @param {object} options
 * @param {string} [options.sourceProfileId='salle-b']
 * @param {string} [options.targetProfileId='demo-32x32']
 * @param {string} [options.label]
 * @param {number} [options.viewportSize=32]
 * @param {number} [options.colStart]  défaut : centré
 * @param {number} [options.originRow] défaut : centré
 * @param {string} [options.xlsxOut]
 */
function createViewportProfile(options = {}) {
  ensureMigrated();

  const sourceId = sanitizeProfileId(options.sourceProfileId ?? "salle-b");
  const targetId = sanitizeProfileId(options.targetProfileId ?? "demo-32x32");
  const viewportSize = Number(options.viewportSize ?? 32);
  if (!Number.isInteger(viewportSize) || viewportSize < 2 || viewportSize % 2 !== 0) {
    throw new Error("viewportSize doit être un entier pair ≥ 2");
  }

  const sourcePath = getConfigPath(sourceId);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Profil source introuvable : ${sourceId}`);
  }

  const source = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
  const rgb = (source.segments ?? []).filter((s) => s.type === "rgb");
  const devices = (source.segments ?? []).filter((s) => s.type !== "rgb");

  if (rgb.length < viewportSize) {
    throw new Error(
      `Source ${sourceId} n’a que ${rgb.length} bandes RGB (besoin ≥ ${viewportSize})`,
    );
  }

  const colStart =
    options.colStart != null
      ? Number(options.colStart)
      : Math.floor((rgb.length - viewportSize) / 2);
  const colEnd = colStart + viewportSize;
  if (colStart < 0 || colEnd > rgb.length) {
    throw new Error(`Plage colonnes invalide : [${colStart}, ${colEnd})`);
  }

  const originRow =
    options.originRow != null
      ? Number(options.originRow)
      : Math.floor((DEFAULT_PHYSICAL_ROWS - viewportSize) / 2);

  const slicedRgb = rgb.slice(colStart, colEnd).map((seg, index) => {
    const copy = { ...seg, name: String(index + 1) };
    delete copy.ehubOffset;
    return copy;
  });

  // Recalcule ehubOffset contigu pour le sous-ensemble
  let ehubOffset = 0;
  for (const seg of slicedRgb) {
    seg.ehubOffset = ehubOffset;
    ehubOffset += seg.entityCount;
  }

  const config = {
    version: source.version ?? 1,
    generatedFrom: options.xlsxOut
      ? path.basename(options.xlsxOut)
      : `viewport:${sourceId}:${colStart}-${colEnd - 1}`,
    description: `Viewport ${viewportSize}×${viewportSize} centré (colonnes ${colStart}–${colEnd - 1}, originRow=${originRow}) — dérivé de ${sourceId}`,
    viewport: {
      visibleRows: viewportSize,
      originRow,
      physicalVisibleRows: DEFAULT_PHYSICAL_ROWS,
      ascendingLastVisibleOffset: 128,
      descendingFirstVisibleOffset: 130,
      sourceProfile: sourceId,
      sourceColumnStart: colStart,
      sourceColumnEnd: colEnd - 1,
    },
    controllers: source.controllers,
    segments: [...slicedRgb, ...devices],
    stats: {
      segmentCount: slicedRgb.length + devices.length,
      ledBandCount: slicedRgb.length,
      ledEntityCount: slicedRgb.reduce((sum, s) => sum + s.entityCount, 0),
      controllerCount: (source.controllers ?? []).length,
    },
  };

  const errors = validateConfig(config);
  if (errors.length) {
    throw new Error(`Config viewport invalide :\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }

  const dir = profileDir(targetId);
  fs.mkdirSync(dir, { recursive: true });

  const configPath = getConfigPath(targetId);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");

  const wallBands = murLedToWallBands(config, {
    profile: targetId,
    generatedFrom: config.generatedFrom,
  });
  writeWallBands(wallBands, getWallBandsPath(targetId));

  const meta = {
    id: targetId,
    label: options.label ?? `Demo ${viewportSize}×${viewportSize} centré`,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(getMetaPath(targetId), `${JSON.stringify(meta, null, 2)}\n`, "utf-8");

  const xlsxOut =
    options.xlsxOut ??
    path.join(PROJECT_ROOT, "mapping", `Ecran-${viewportSize}x${viewportSize}.xlsx`);
  writeViewportExcel({
    sourceXlsx: options.sourceXlsx ?? MAPPING_PATH,
    outPath: xlsxOut,
    colStart,
    colEnd,
    rgbSegments: slicedRgb,
    deviceSegments: devices,
  });

  // Archive Excel dans le profil
  const archiveXlsx = path.join(dir, path.basename(xlsxOut));
  fs.copyFileSync(xlsxOut, archiveXlsx);

  return {
    profileId: targetId,
    configPath,
    wallBandsPath: getWallBandsPath(targetId),
    metaPath: getMetaPath(targetId),
    xlsxPath: xlsxOut,
    archiveXlsx,
    viewport: config.viewport,
    stats: config.stats,
  };
}

/**
 * Génère un Excel N bandes + devices via un helper Python (openpyxl).
 */
function writeViewportExcel({
  sourceXlsx,
  outPath,
  colStart,
  colEnd,
  rgbSegments,
  deviceSegments,
}) {
  const helper = path.join(__dirname, "writeViewportExcel.py");
  const payload = {
    sourceXlsx,
    outPath,
    colStart,
    colEnd,
    // Si la source Excel existe, on slice les lignes ; sinon on reconstruit depuis les segments
    rows: rgbSegments.map((seg, i) => ({
      name: seg.name ?? String(i + 1),
      entityStart: seg.entityStart,
      entityEnd: seg.entityEnd,
      controllerIp: seg.controllerIp,
      universe: seg.universe,
    })),
    devices: deviceSegments.map((seg) => ({
      name: seg.name,
      type: seg.type,
      dmxChannelStart: seg.dmxChannelStart,
      dmxChannelEnd: seg.dmxChannelEnd,
      controllerIp: seg.controllerIp,
      universe: seg.universe,
    })),
  };

  const tmpJson = path.join(
    require("os").tmpdir(),
    `viewport-xlsx-${Date.now()}.json`,
  );
  fs.writeFileSync(tmpJson, JSON.stringify(payload));
  try {
    execFileSync("python3", [helper, tmpJson], { stdio: "inherit" });
  } finally {
    fs.rmSync(tmpJson, { force: true });
  }
}

module.exports = {
  createViewportProfile,
  DEFAULT_PHYSICAL_ROWS,
};
