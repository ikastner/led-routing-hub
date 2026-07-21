/**
 * Parse mapping/Ecran.xlsx → config mur-led (sans dépendre du CLI).
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const { MAPPING_PATH } = require("./paths");

function readSharedStrings(xml) {
  const strings = [];
  const re = /<si>(?:<t[^>]*>([^<]*)<\/t>|<t\/>)?/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    strings.push(m[1] ?? "");
  }
  return strings;
}

function parseSheet(xml, sharedStrings) {
  const rows = [];
  const rowRe = /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const rowNum = parseInt(rowMatch[1], 10);
    const rowXml = rowMatch[2];
    const cells = {};
    const cellRe =
      /<c r="([A-Z]+)(\d+)"([^>]*)>(?:<f[^>]*\/>|<f[^>]*>[^<]*<\/f>)?<v>([^<]*)<\/v>/g;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowXml)) !== null) {
      const col = cellMatch[1];
      const attrs = cellMatch[3];
      const raw = cellMatch[4];
      const t = attrs.match(/t="([^"]+)"/)?.[1];
      let value = raw;
      if (t === "s") value = sharedStrings[parseInt(raw, 10)] ?? raw;
      else if (/^\d+(\.\d+)?$/.test(raw)) value = Number(raw);
      cells[col] = value;
    }
    rows.push({ rowNum, cells });
  }
  return rows;
}

function buildConfig(rows, { generatedFrom = "mapping/Ecran.xlsx" } = {}) {
  const controllers = [
    { ip: "192.168.1.45", label: "BC216-1", universeMin: 0, universeMax: 31, universeCount: 32 },
    { ip: "192.168.1.46", label: "BC216-2", universeMin: 0, universeMax: 31, universeCount: 32 },
    { ip: "192.168.1.47", label: "BC216-3", universeMin: 0, universeMax: 31, universeCount: 32 },
    { ip: "192.168.1.48", label: "BC216-4", universeMin: 0, universeMax: 33, universeCount: 34 },
  ];

  const segments = [];
  let ehubOffset = 0;

  for (const row of rows) {
    if (row.rowNum < 2 || row.rowNum > 129) continue;
    const name = String(row.cells.A ?? row.rowNum - 1);
    const entityStart = Number(row.cells.B);
    const entityEnd = Number(row.cells.C);
    const controllerIp = String(row.cells.D);
    const universe = Number(row.cells.E);
    if (!entityStart || !entityEnd || !controllerIp) continue;

    const entityCount = entityEnd - entityStart + 1;
    segments.push({
      name,
      type: "rgb",
      channelsPerEntity: 3,
      entityStart,
      entityEnd,
      entityCount,
      controllerIp,
      universe,
      dmxChannelStart: 1,
      ehubOffset,
      pixelCount: entityCount,
    });
    ehubOffset += entityCount;
  }

  const deviceRows = rows.filter((r) => r.rowNum >= 130);
  for (const row of deviceRows) {
    const name = String(row.cells.A ?? "");
    const b = Number(row.cells.B);
    const c = Number(row.cells.C);
    const controllerIp = String(row.cells.D ?? "192.168.1.48");
    const universe = Number(row.cells.E ?? 33);

    if (name.toLowerCase().includes("projector") || name.toLowerCase().includes("projecteur")) {
      segments.push({
        name: "Projector",
        type: "rgbw",
        channelsPerEntity: 4,
        entityStart: 1,
        entityEnd: 1,
        entityCount: 1,
        controllerIp,
        universe,
        dmxChannelStart: 1,
        dmxChannelEnd: 4,
      });
    } else if (name.toLowerCase().includes("lyre")) {
      segments.push({
        name,
        type: "moving_head",
        channelsPerEntity: 14,
        controllerIp,
        universe,
        dmxChannelStart: b,
        dmxChannelEnd: c,
      });
    }
  }

  const ledSegments = segments.filter((s) => s.type === "rgb");
  return {
    version: 1,
    generatedFrom,
    description: "Mapping mur LED 128×128 + projecteur RGBW + 4 lyres (BC216)",
    controllers,
    segments,
    stats: {
      segmentCount: segments.length,
      ledBandCount: ledSegments.length,
      ledEntityCount: ledSegments.reduce((sum, s) => sum + s.entityCount, 0),
      controllerCount: controllers.length,
    },
  };
}

/**
 * @param {string} [xlsxPath]
 * @returns {object} config mur-led
 */
function parseEcran(xlsxPath = MAPPING_PATH) {
  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`Fichier Excel introuvable : ${xlsxPath}`);
  }

  const tmp = path.join(os.tmpdir(), `ecran-parse-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(tmp, { recursive: true });
  try {
    execSync(`unzip -o -q "${xlsxPath}" -d "${tmp}"`);
    const sharedPath = path.join(tmp, "xl", "sharedStrings.xml");
    const sheetPath = path.join(tmp, "xl", "worksheets", "sheet1.xml");
    if (!fs.existsSync(sheetPath)) {
      throw new Error("Excel invalide : worksheet sheet1.xml introuvable");
    }
    const sharedStrings = fs.existsSync(sharedPath)
      ? readSharedStrings(fs.readFileSync(sharedPath, "utf-8"))
      : [];
    const sheet = fs.readFileSync(sheetPath, "utf-8");
    const rows = parseSheet(sheet, sharedStrings);
    return buildConfig(rows, {
      generatedFrom: path.basename(xlsxPath),
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = {
  parseEcran,
  buildConfig,
  MAPPING_PATH,
};
