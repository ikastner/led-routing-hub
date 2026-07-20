const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { MAPPING_PATH, CONFIG_PATH } = require("../src/core/paths");

function readSharedStrings(xml) {
  const strings = [];
  const re = /<si>(?:<t[^>]*>([^<]*)<\/t>|<t\/>)?/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    strings.push(m[1] ?? "");
  }
  return strings;
}

function cellValue(cell, sharedStrings) {
  const t = cell.match(/t="([^"]+)"/)?.[1];
  const v = cell.match(/<v>([^<]*)<\/v>/)?.[1];
  if (!v && v !== "0") return null;
  if (t === "s") return sharedStrings[parseInt(v, 10)] ?? v;
  return v;
}

function parseSheet(xml, sharedStrings) {
  const rows = [];
  const rowRe = /<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const rowNum = parseInt(rowMatch[1], 10);
    const rowXml = rowMatch[2];
    const cells = {};
    const cellRe = /<c r="([A-Z]+)(\d+)"([^>]*)>(?:<f[^>]*\/>|<f[^>]*>[^<]*<\/f>)?<v>([^<]*)<\/v>/g;
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

function buildConfig(rows) {
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
    generatedFrom: "mapping/Ecran.xlsx",
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

function parseEcran(xlsxPath = MAPPING_PATH) {
  const tmp = path.join(require("os").tmpdir(), `ecran-parse-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  try {
    execSync(`unzip -o -q "${xlsxPath}" -d "${tmp}"`);
    const sharedStrings = readSharedStrings(
      fs.readFileSync(path.join(tmp, "xl", "sharedStrings.xml"), "utf-8")
    );
    const sheet = fs.readFileSync(path.join(tmp, "xl", "worksheets", "sheet1.xml"), "utf-8");
    const rows = parseSheet(sheet, sharedStrings);
    return buildConfig(rows);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const { WALL_BANDS_PATH } = require("../src/core/paths");
  const { deriveAndWriteWallBands } = require("../src/core/wallBands");

  const out = process.argv[2] ?? CONFIG_PATH;
  console.log(`Parse ${MAPPING_PATH}…`);
  const config = parseEcran();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(config, null, 2)}\n`);
  const wallBands = deriveAndWriteWallBands(config, WALL_BANDS_PATH, {
    generatedFrom: "mapping/Ecran.xlsx",
  });
  console.log(`Écrit ${out}`);
  console.log(`Écrit ${WALL_BANDS_PATH} (${wallBands.columns} colonnes)`);
  console.log(`  ${config.stats.ledBandCount} bandes, ${config.stats.ledEntityCount} entités LED`);
}

if (require.main === module) {
  main();
}

module.exports = { parseEcran, buildConfig };
