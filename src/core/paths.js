const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const CONFIG_PATH = path.join(PROJECT_ROOT, "config", "mur-led.json");
const WALL_BANDS_PATH = path.join(PROJECT_ROOT, "config", "wall-bands.json");
const MAPPING_PATH = path.join(PROJECT_ROOT, "mapping", "Ecran.xlsx");
const CONFIG_API_PORT = 6456;

module.exports = {
  PROJECT_ROOT,
  CONFIG_PATH,
  WALL_BANDS_PATH,
  MAPPING_PATH,
  CONFIG_API_PORT,
};
