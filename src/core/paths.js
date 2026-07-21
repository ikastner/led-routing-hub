const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
/** Override tests : LED_CONFIG_DIR=/tmp/xxx */
const CONFIG_DIR = process.env.LED_CONFIG_DIR
  ? path.resolve(process.env.LED_CONFIG_DIR)
  : path.join(PROJECT_ROOT, "config");
const PROFILES_DIR = path.join(CONFIG_DIR, "profiles");
const ACTIVE_FILE = path.join(CONFIG_DIR, "active.json");

/** Chemins legacy (pré-multi-profils) — migration + miroir du profil actif. */
const LEGACY_CONFIG_PATH = path.join(CONFIG_DIR, "mur-led.json");
const LEGACY_WALL_BANDS_PATH = path.join(CONFIG_DIR, "wall-bands.json");

/** Alias historiques — pointent vers le legacy (miroir). Préférer profiles.getConfigPath(). */
const CONFIG_PATH = LEGACY_CONFIG_PATH;
const WALL_BANDS_PATH = LEGACY_WALL_BANDS_PATH;

const MAPPING_PATH = path.join(PROJECT_ROOT, "mapping", "Ecran.xlsx");
const CONFIG_API_PORT = 6456;

module.exports = {
  PROJECT_ROOT,
  CONFIG_DIR,
  PROFILES_DIR,
  ACTIVE_FILE,
  LEGACY_CONFIG_PATH,
  LEGACY_WALL_BANDS_PATH,
  CONFIG_PATH,
  WALL_BANDS_PATH,
  MAPPING_PATH,
  CONFIG_API_PORT,
};
