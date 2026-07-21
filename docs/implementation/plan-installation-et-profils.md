# Plan — Installation multi-profils & sync authoring

> Objectif time-to-market : un technicien spectacle configure l’installation dans le Routing Hub (Excel + profils), sans terminal, et exporte un mapping utilisable immédiatement par `led-studio-editor` / Unity.

## État actuel (baseline)

| Élément | Aujourd’hui |
|---------|-------------|
| Config | Un seul fichier [`config/mur-led.json`](../../config/mur-led.json) |
| Excel | [`mapping/Ecran.xlsx`](../../mapping/Ecran.xlsx) → `npm run parse` (CLI) |
| UI config | Textarea JSON brut (onglet Configuration) |
| Authoring | `wall-bands.json` **dupliqué à la main** dans le studio / Unity |
| Sync | Aucune — risque de mapping périmé après re-parse |

Fichiers clés :

- [`src/core/paths.js`](../../src/core/paths.js) — `CONFIG_PATH` / `MAPPING_PATH` hardcodés
- [`src/core/config.js`](../../src/core/config.js) — load / save / validate
- [`tools/parse-ecran.js`](../../tools/parse-ecran.js) — Excel → JSON
- [`src/main/engine.js`](../../src/main/engine.js) + IPC — get/save/reload config
- [`src/renderer/app.js`](../../src/renderer/app.js) — UI actuelle

---

## Architecture cible

```
config/
  active.json                    # { "profile": "glassworks-paris" }
  profiles/
    glassworks-paris/
      mur-led.json               # vérité physique
      wall-bands.json            # dérivé (authoring)
      Ecran.xlsx                 # source Excel (optionnel, archivé)
      meta.json                  # { "label": "…", "updatedAt": "…" }
    salle-b/
      mur-led.json
      wall-bands.json
      …
```

Règles :

1. **Un seul profil actif** à la fois (pas deux engines ArtNet en parallèle).
2. Changer de profil → blackout → reload buffers → nouveau mapping.
3. Après chaque parse / save : régénérer `wall-bands.json` du profil.
4. Controllers restent dans `mur-led.json` (comme aujourd’hui).

---

## Phases

### P0 — Dériver `wall-bands` depuis `mur-led` (1–2 j)

**But** : supprimer la duplication manuelle, même avec un seul profil.

#### Tâches

1. **Créer** `src/core/wallBands.js`
   - `murLedToWallBands(config) → { columns, bands, generatedFrom?, profile? }`
   - Extraire segments `type === "rgb"` uniquement
   - Tests : comparer au `wall-bands.json` actuel du studio (0 mismatch sur 128 bandes)

2. **Brancher l’écriture auto**
   - Après `parse-ecran.js` (CLI) : écrire `config/wall-bands.json` (ou chemin profil)
   - Après `saveConfig` / `saveConfigData` : régénérer le dérivé
   - Script npm optionnel : `"export:wall-bands": "node tools/export-wall-bands.js"`

3. **Documenter** le schéma dans [`contrat-authoring.md`](./contrat-authoring.md)

#### Critères d’acceptation

- [ ] `npm run parse` produit `mur-led.json` **et** `wall-bands.json`
- [ ] Les 128 bandes matchent le fichier studio actuel
- [ ] Test unitaire `tests/wallBands.test.js` vert

#### Fichiers touchés

| Fichier | Action |
|---------|--------|
| `src/core/wallBands.js` | Créer |
| `tools/parse-ecran.js` | Appeler dérivation + write |
| `src/core/config.js` ou `engine.js` | Régénérer au save |
| `tools/export-wall-bands.js` | Créer (CLI) |
| `tests/wallBands.test.js` | Créer |

---

### P1 — Multi-profils (2–3 j)

**But** : plusieurs salles / mappings, une config active.

#### Tâches

1. **Layout disque** `config/profiles/<id>/` + `config/active.json`
2. **Migrer** l’existant : `mur-led.json` → `profiles/default/` (ou `glassworks`) au premier lancement
3. **API core** `src/core/profiles.js`
   - `listProfiles()`, `getActiveProfile()`, `setActiveProfile(id)`
   - `createProfile({ id, label })`, `deleteProfile(id)`
   - `getConfigPath(profileId)`, `getWallBandsPath(profileId)`
4. **Adapter** `paths.js` / `loadConfig()` pour résoudre le profil actif
5. **IPC** nouveaux canaux :
   - `engine:profiles:list`
   - `engine:profiles:activate`
   - `engine:profiles:create`
   - `engine:profiles:delete`
6. **Engine** : `activateProfile` → stop sender si besoin → blackout → reload config → recreate bufferManager
7. **CLI** : `npm run router -- --profile glassworks-paris` (optionnel)

#### Critères d’acceptation

- [x] Deux profils coexistent sur disque
- [x] Activer un profil change le mapping runtime (vérifiable via moniteur DMX + faker)
- [x] `active.json` persiste le choix au redémarrage
- [x] Migration auto depuis l’ancien `config/mur-led.json`

#### Fichiers touchés

| Fichier | Action |
|---------|--------|
| `src/core/profiles.js` | Créer |
| `src/core/paths.js` | Chemins dynamiques |
| `src/core/config.js` | Load/save relatif au profil |
| `src/main/engine.js` | activate + migrate |
| `src/main/ipc.js` / `preload.js` | Nouveaux handlers |
| `tools/router-cli.js` | Flag `--profile` |

---

### P2 — UI Installation (Excel + profils) (3–4 j)

**But** : plus besoin du terminal pour le flux métier.

#### UX (onglet **Installation**)

1. Liste des profils + badge « actif »
2. Actions : Nouveau / Renommer / Supprimer / Activer
3. Bloc Excel :
   - **Télécharger le template** (`Ecran.xlsx` type)
   - **Importer un Excel** (dialog fichier → parse → validate → save profil)
4. Résumé install (pas le JSON) :
   - N contrôleurs, N bandes LED, N entités, lyres, projecteur
5. Boutons :
   - **Exporter mapping authoring** → sauvegarde `wall-bands.json` (dialog)
   - Mode avancé : éditeur JSON (actuel, relégué)

#### Tâches

1. Exposer `parseEcran(xlsxPath)` depuis un module réutilisable (extraire hors du `main` CLI)
2. IPC `engine:import-excel` / `engine:export-wall-bands` / `engine:download-template`
3. UI renderer : nouvelle section dans [`index.html`](../../src/renderer/index.html) + [`app.js`](../../src/renderer/app.js) + styles
4. Garder l’onglet Configuration JSON en « Avancé »

#### Critères d’acceptation

- [x] Import Excel depuis l’UI régénère `mur-led` + `wall-bands` du profil
- [x] Erreurs de validation affichées clairement (chevauchement DMX, etc.)
- [x] Export `wall-bands.json` utilisable tel quel par le studio
- [x] Un technicien fait le flux sans ouvrir un terminal

#### Fichiers touchés

| Fichier | Action |
|---------|--------|
| `src/core/parseEcran.js` | Extraire depuis `tools/parse-ecran.js` |
| `src/renderer/index.html` | Onglet Installation |
| `src/renderer/app.js` | Handlers UI |
| `src/renderer/styles.css` | Layout cartes / liste profils |
| `src/main/*` | IPC import/export |

---

### P3 — Confort démo (optionnel, +1 j)

- Indicateur dashboard : profil actif + nb entités LED
- Confirmation avant activation si moteur running
- Watchdog / blackout rappelé à l’activation

---

### P4 — API HTTP : les authorings interrogent le Hub (2–3 j)

**But** : Studio Electron et Unity ne réimportent plus un fichier à la main — ils **fetch** le mapping du profil actif.

UDP `:6455` reste le canal **state** (couleurs).  
HTTP (ex. `:6456`) est le canal **config** (wall-bands / profil).

#### Endpoints

| Méthode | Chemin | Réponse |
|---------|--------|---------|
| `GET` | `/api/health` | `{ ok: true, version, running }` |
| `GET` | `/api/active-profile` | `{ id, label }` |
| `GET` | `/api/wall-bands` | JSON `wall-bands` du profil actif (dérivé) |
| `GET` | `/api/mur-led` | (optionnel, debug) config complète |

CORS ouvert en local (`Access-Control-Allow-Origin: *`) pour Electron / Unity Editor.

#### Tâches

1. **Créer** `src/core/configServer.js` (Node `http` natif, pas d’Express obligatoire)
   - Démarre avec le moteur (ou au lancement Electron)
   - Port configurable (défaut **6456**, distinct de l’UDP 6455)
   - Sert toujours le **profil actif** (recalcul / lecture `wall-bands` à la volée)

2. **Brancher** dans `engine.js` : start/stop du serveur config avec le moteur (ou lifecycle app)

3. **Dashboard** : afficher `Config API : http://127.0.0.1:6456` + lien health

4. **Doc contrat** : documenter URL + schéma dans [`contrat-authoring.md`](./contrat-authoring.md)

5. **Clients** (hors ce repo, mais critères de done) :
   - Studio Electron : phase **S3** — `fetch` avant Preview + cache local
   - Unity : bouton / Start — `UnityWebRequest` → `WallMapping.Initialize` + fallback Resources

#### Critères d’acceptation

- [ ] `curl http://127.0.0.1:6456/api/wall-bands` renvoie 128 bandes quand le Hub tourne
- [ ] Changer de profil actif → le prochain GET reflète le nouveau mapping
- [ ] Hub arrêté → clients gardent le dernier mapping en cache (pas de crash)
- [ ] Studio / Unity peuvent sync sans passer par un file picker

#### Fichiers touchés

| Fichier | Action |
|---------|--------|
| `src/core/configServer.js` | Créer |
| `src/main/engine.js` | Start/stop serveur |
| `src/main/ipc.js` / `preload.js` | Optionnel : port config exposé à l’UI |
| `src/renderer/*` | Afficher URL API |
| `tools/router-cli.js` | Flag `--config-port 6456` |
| `tests/configServer.test.js` | Créer |

---

## Hors scope (volontairement)

- Édition visuelle du patch DMX (drag & drop univers)
- Multi-moteurs ArtNet simultanés
- Cloud / comptes utilisateurs
- WebSocket push (polling / fetch à la demande suffit en v1 API)

---

## Ordre de livraison recommandé

```
P0 (dérivation wall-bands)
  → P1 (multi-profils)
    → P2 (UI Installation Excel)
      → P3 (polish)
        → P4 (API HTTP wall-bands)
```

- Dès **P0** : Studio / Unity peuvent consommer un fichier exporté.
- Dès **P4** : ils **interrogent** le Hub (`GET /api/wall-bands`).

Plans clients :

- Electron : [`led-studio-editor/docs/implementation/plan-sync-config-routing.md`](../../../led-studio-editor/docs/implementation/plan-sync-config-routing.md) (phase **S3**)
- Unity : même contrat ; fetch au Start / bouton Sync Hub → `WallMapping`

---

## Tests

| Test | Phase |
|------|-------|
| `wallBands.test.js` — dérivation = 128 bandes / 16576 entités | P0 |
| `profiles.test.js` — create / activate / migrate | P1 |
| Import Excel fixture → validateConfig OK | P2 |
| `configServer.test.js` — health + wall-bands + changement profil | P4 |
| Régression : `npm test` + `npm run validate` | toutes |

---

## Checklist mise en prod interne

1. Migrer `config/mur-led.json` actuel → profil `default`
2. Régénérer `wall-bands.json` (fichier + API)
3. Documenter le template Excel pour l’équipe technique
4. Documenter `http://127.0.0.1:6456/api/wall-bands` pour Studio / Unity
5. Mettre à jour [`README.md`](../../README.md) : flux UI > CLI + API config
