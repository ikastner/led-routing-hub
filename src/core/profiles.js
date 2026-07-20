/**
 * Multi-profils d'installation — un seul actif à la fois.
 * Layout : config/profiles/<id>/{mur-led.json,wall-bands.json,meta.json}
 */

const fs = require("fs");
const path = require("path");
const {
  PROJECT_ROOT,
  PROFILES_DIR,
  ACTIVE_FILE,
  LEGACY_CONFIG_PATH,
  LEGACY_WALL_BANDS_PATH,
  MAPPING_PATH,
} = require("./paths");

const DEFAULT_PROFILE_ID = "default";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function profileDir(profileId) {
  return path.join(PROFILES_DIR, profileId);
}

function getConfigPath(profileId) {
  return path.join(profileDir(profileId), "mur-led.json");
}

function getWallBandsPath(profileId) {
  return path.join(profileDir(profileId), "wall-bands.json");
}

function getMetaPath(profileId) {
  return path.join(profileDir(profileId), "meta.json");
}

function readActiveId() {
  if (!fs.existsSync(ACTIVE_FILE)) return DEFAULT_PROFILE_ID;
  try {
    const data = JSON.parse(fs.readFileSync(ACTIVE_FILE, "utf-8"));
    return data.profile || DEFAULT_PROFILE_ID;
  } catch {
    return DEFAULT_PROFILE_ID;
  }
}

function writeActiveId(profileId) {
  ensureDir(path.dirname(ACTIVE_FILE));
  fs.writeFileSync(
    ACTIVE_FILE,
    `${JSON.stringify({ profile: profileId }, null, 2)}\n`,
    "utf-8",
  );
}

function readMeta(profileId) {
  const metaPath = getMetaPath(profileId);
  if (!fs.existsSync(metaPath)) {
    return {
      id: profileId,
      label: profileId,
      updatedAt: null,
    };
  }
  return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
}

function writeMeta(profileId, meta) {
  const payload = {
    id: profileId,
    label: meta.label ?? profileId,
    updatedAt: meta.updatedAt ?? new Date().toISOString(),
  };
  fs.writeFileSync(getMetaPath(profileId), `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  return payload;
}

function sanitizeProfileId(id) {
  const cleaned = String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned) throw new Error("Identifiant de profil invalide");
  return cleaned;
}

/**
 * Migre config/mur-led.json → profiles/default/ si besoin.
 * Idempotent.
 */
function ensureMigrated() {
  ensureDir(PROFILES_DIR);

  const defaultConfigPath = getConfigPath(DEFAULT_PROFILE_ID);
  const hasDefault = fs.existsSync(defaultConfigPath);
  const hasLegacy = fs.existsSync(LEGACY_CONFIG_PATH);

  if (!hasDefault && hasLegacy) {
    ensureDir(profileDir(DEFAULT_PROFILE_ID));
    fs.copyFileSync(LEGACY_CONFIG_PATH, defaultConfigPath);
    if (fs.existsSync(LEGACY_WALL_BANDS_PATH)) {
      fs.copyFileSync(LEGACY_WALL_BANDS_PATH, getWallBandsPath(DEFAULT_PROFILE_ID));
    }
    writeMeta(DEFAULT_PROFILE_ID, {
      label: "Default (Glassworks)",
      updatedAt: new Date().toISOString(),
    });
    console.log(`[profiles] migration : ${LEGACY_CONFIG_PATH} → profiles/${DEFAULT_PROFILE_ID}/`);
  }

  if (!fs.existsSync(ACTIVE_FILE)) {
    const active = hasDefault || hasLegacy ? DEFAULT_PROFILE_ID : DEFAULT_PROFILE_ID;
    writeActiveId(active);
  }

  // Si active pointe vers un profil inexistant, fallback default
  const activeId = readActiveId();
  if (!fs.existsSync(getConfigPath(activeId))) {
    if (fs.existsSync(defaultConfigPath)) {
      writeActiveId(DEFAULT_PROFILE_ID);
    }
  }

  return readActiveProfile();
}

function readActiveProfile() {
  const id = readActiveId();
  const meta = readMeta(id);
  return {
    id,
    label: meta.label ?? id,
    updatedAt: meta.updatedAt ?? null,
    configPath: getConfigPath(id),
    wallBandsPath: getWallBandsPath(id),
  };
}

function listProfiles() {
  ensureMigrated();
  if (!fs.existsSync(PROFILES_DIR)) return [];

  const activeId = readActiveId();
  return fs
    .readdirSync(PROFILES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const meta = readMeta(d.name);
      return {
        id: d.name,
        label: meta.label ?? d.name,
        updatedAt: meta.updatedAt ?? null,
        active: d.name === activeId,
        hasConfig: fs.existsSync(getConfigPath(d.name)),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function getActiveProfile() {
  ensureMigrated();
  return readActiveProfile();
}

function setActiveProfile(profileId) {
  ensureMigrated();
  const id = sanitizeProfileId(profileId);
  if (!fs.existsSync(getConfigPath(id))) {
    throw new Error(`Profil introuvable ou sans mur-led.json : ${id}`);
  }
  writeActiveId(id);
  // Miroir legacy pour outils externes / compat
  syncLegacyCopies(id);
  return getActiveProfile();
}

function syncLegacyCopies(profileId) {
  const cfg = getConfigPath(profileId);
  const wb = getWallBandsPath(profileId);
  if (fs.existsSync(cfg)) {
    fs.copyFileSync(cfg, LEGACY_CONFIG_PATH);
  }
  if (fs.existsSync(wb)) {
    fs.copyFileSync(wb, LEGACY_WALL_BANDS_PATH);
  }
}

function createProfile({ id, label, fromActive = true } = {}) {
  ensureMigrated();
  const profileId = sanitizeProfileId(id);
  const dir = profileDir(profileId);
  if (fs.existsSync(getConfigPath(profileId))) {
    throw new Error(`Profil déjà existant : ${profileId}`);
  }

  ensureDir(dir);

  if (fromActive) {
    const active = getActiveProfile();
    if (fs.existsSync(active.configPath)) {
      fs.copyFileSync(active.configPath, getConfigPath(profileId));
    } else if (fs.existsSync(LEGACY_CONFIG_PATH)) {
      fs.copyFileSync(LEGACY_CONFIG_PATH, getConfigPath(profileId));
    } else {
      throw new Error("Aucune config source pour créer le profil");
    }
    if (fs.existsSync(active.wallBandsPath)) {
      fs.copyFileSync(active.wallBandsPath, getWallBandsPath(profileId));
    } else if (fs.existsSync(LEGACY_WALL_BANDS_PATH)) {
      fs.copyFileSync(LEGACY_WALL_BANDS_PATH, getWallBandsPath(profileId));
    }
  }

  writeMeta(profileId, {
    label: label ?? profileId,
    updatedAt: new Date().toISOString(),
  });

  return listProfiles().find((p) => p.id === profileId);
}

function deleteProfile(profileId) {
  ensureMigrated();
  const id = sanitizeProfileId(profileId);
  if (id === DEFAULT_PROFILE_ID) {
    throw new Error("Impossible de supprimer le profil default");
  }
  const active = readActiveId();
  if (active === id) {
    throw new Error("Impossible de supprimer le profil actif — activez-en un autre d’abord");
  }
  const dir = profileDir(id);
  if (!fs.existsSync(dir)) {
    throw new Error(`Profil introuvable : ${id}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return listProfiles();
}

function touchProfile(profileId) {
  const meta = readMeta(profileId);
  writeMeta(profileId, {
    ...meta,
    updatedAt: new Date().toISOString(),
  });
}

/** Renomme le label d’un profil (l’id disque reste inchangé). */
function renameProfile(profileId, label) {
  ensureMigrated();
  const id = sanitizeProfileId(profileId);
  if (!fs.existsSync(getConfigPath(id))) {
    throw new Error(`Profil introuvable : ${id}`);
  }
  const trimmed = String(label || "").trim();
  if (!trimmed) throw new Error("Label requis");
  writeMeta(id, {
    ...readMeta(id),
    label: trimmed,
    updatedAt: new Date().toISOString(),
  });
  return listProfiles().find((p) => p.id === id);
}

module.exports = {
  DEFAULT_PROFILE_ID,
  MAPPING_PATH,
  PROJECT_ROOT,
  ensureMigrated,
  listProfiles,
  getActiveProfile,
  setActiveProfile,
  createProfile,
  deleteProfile,
  renameProfile,
  profileDir,
  getConfigPath,
  getWallBandsPath,
  getMetaPath,
  syncLegacyCopies,
  touchProfile,
  sanitizeProfileId,
};
