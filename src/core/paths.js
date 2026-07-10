const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const CONFIG_PATH = path.join(PROJECT_ROOT, "config", "mur-led.json");
const MAPPING_PATH = path.join(PROJECT_ROOT, "mapping", "Ecran.xlsx");

module.exports = {
  PROJECT_ROOT,
  CONFIG_PATH,
  MAPPING_PATH,
};
