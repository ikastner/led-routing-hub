# Architecture code — LED Routing Hub

Document **orienté code** : où regarder, quoi appelle quoi, hot path, points d’extension.  
Pour l’usage produit / workflows, voir [documentation-generale.md](./documentation-generale.md).  
Pour le binaire réseau, voir [protocole-state.md](./protocole-state.md).

---

## 1. Carte rapide

```
tools/router-cli.js          npm run router   → moteur CLI (spectacle)
src/main/main.js             npm start        → Electron UI
        │
        ▼
src/main/engine.js           RoutingEngine (orchestration)
        │
        ├── src/core/stateReceiver.js   UDP :6455
        ├── src/core/dmxBuffers.js      buffers + dirty
        ├── src/core/senderLoop.js      ArtNet :6454 @ 40 Hz
        ├── src/core/watchdog.js        blackout silence
        ├── src/core/configServer.js    HTTP :6456
        └── src/core/profiles.js        profils d’installation
```

| Couche | Dossier | Responsabilité |
|--------|---------|----------------|
| CLI / UI | `tools/`, `src/main/`, `src/renderer/` | Démarrer, configurer, visualiser |
| Orchestration | `src/main/engine.js` | Assemble les modules core |
| Métier | `src/core/` | Protocole, mapping, DMX, ArtNet, config |
| Tests | `tests/` | Contrats unitaires Node (`node --test`) |

**Règle :** le hot path show ne doit **jamais** passer par Electron. En spectacle → `npm run router`.

---

## 2. Points d’entrée

### `tools/router-cli.js`

Moteur autonome (recommandé) :

1. `ensureMigrated()` + éventuel `--profile`
2. `loadConfig()` → `createBufferManager(config)`
3. `createConfigServer(...).start({ port: 6456 })`
4. `startStateReceiver` → `startSenderLoop` → `startWatchdog`
5. Sur `SIGINT` / `SIGTERM` : stop + `blackoutAll`

Options : `--profile`, `--port`, `--config-port`, `--hz`, `--dry-run`, `--watchdog`.

### `src/main/main.js` + `engine.js`

Même moteur encapsulé dans `RoutingEngine` :

- `start(options)` / `stop()` / `triggerBlackout()`
- Profils : `activateProfile`, `createProfile`, …
- Excel : `importExcel(xlsxPath)` → parse → validate → `saveConfig`
- Config API : démarrée avec le moteur (ou via `startConfigApi`)

IPC (`ipc.js` + `preload.js`) expose `window.routing.*` au renderer.

### `tools/faker.js`

Émetteur de référence du protocole (encode LEDS/DEVS). Utile pour lire avant d’écrire un authoring.

---

## 3. Graphe d’appel (une frame)

```
UDP datagram
    │
    ▼
stateReceiver.on("message")
    ├─ magic LEDS → parseLedsChunkHeader + applyLedsChunkColors
    │                    └─ bufferManager.setEntityColor(id, r, g, b)   // O(1)
    └─ magic DEVS → decodeDevsState
                         └─ bufferManager.setDevice(deviceId, channels)
                                    ├─ deviceId 0 → projecteur RGBW
                                    └─ deviceId 1–4 → lyre (lyre.js)

setInterval 25 ms (senderLoop.tick)
    ├─ forceAll tous les 10 ticks → bufferManager.list()
    └─ sinon → takeDirty() (fallback list() si vide)
              └─ buildArtDmxInto(packetPréalloué) → sock.send(ip, 6454)

watchdog (toutes les 500 ms)
    └─ silence ≥ 2 s → bufferManager.blackoutAll() + resetFrameCounters()
```

---

## 4. Modules `src/core/` — API utile

### `protocol.js` — contrat binaire

| Export | Rôle |
|--------|------|
| `STATE_PORT` | `6455` |
| `MAX_LED_ENTRIES_PER_CHUNK` | `400` |
| `encodeLedsChunk` / `decodeLedsChunk` | Round-trip LEDS (tests / faker) |
| `parseLedsChunkHeader` | Header seul (hot path receiver) |
| `applyLedsChunkColors` | Applique RGB **sans** allouer un tableau `colors[]` |
| `encodeDevsState` / `decodeDevsState` | Projecteur + lyres |
| `isNewerFrame` / `isSameOrNewerFrame` | Comparaison `frameId` modulo 65536 |
| `getAllLedChunks` / `chunkEntityRange` | Découpage ranges pour l’émetteur |

Hot path réception : **pas** `decodeLedsChunk` (alloue) → `parseLedsChunkHeader` + `applyLedsChunkColors`.

### `stateReceiver.js`

```js
startStateReceiver(bufferManager, { port, sessionGapMs, onStats })
// → { ready, stop, getLastPacketAt, getStats, resetFrameCounters }
```

- Compteurs `ledFrameId` / `deviceFrameId` **indépendants**
- Silence ≥ `SESSION_GAP_MS` (250 ms) → reset compteurs (relance Unity `frameId=0`)
- Logs 1×/s : `[receiver] X pkt/s | LED frame=… | DEVS frame=…`

### `dmxBuffers.js` — cœur mapping runtime

```js
createBufferManager(config)
// → {
//   setEntityColor, setDevice, blackoutAll,
//   list, listDirty, takeDirty, clearDirty,
//   getEntry, size, …
// }
```

**Au constructeur :**

1. Alloue un `Buffer(512)` par couple `(ip, universe)` via `listUniverses(config)`
2. `buildEntityIndex(segments)` → `Map<entityId, { entry, channel, type }>`

**Écritures :**

| Méthode | Comportement |
|---------|--------------|
| `setEntityColor(id, r, g, b[, w])` | Lookup index O(1) → `setRgb` / `setRgbw` → dirty |
| `setDevice(0, …)` | Projecteur : shutter `0` = off ; sinon RGBW × dimmer |
| `setDevice(1–4, …)` | Lyre : pan/tilt (+ croisement éventuel), shutter mappé, offsets dangereux → 0 |
| `takeDirty()` | Liste les univers dirty **et vide** le Set |
| `list()` | Tous les univers (full refresh) |

### `resolve.js` — résolution “lente”

Utilisé hors hot path (tests, `test-led`, fallback projecteur) :

- `resolveEntity(entityId, segments)` — scan linéaire des segments
- `resolveLyre(index, config)` — lyre 1–4
- `resolveProjector(config)`

Sur le mur en show, le chemin rapide est l’**index** de `dmxBuffers`, pas `resolveEntity`.

### `senderLoop.js`

```js
startSenderLoop(bufferManager, { hz = 40, dryRun = false, sendAllEvery = 10 })
```

- `setInterval` → tick toutes les `1000/hz` ms
- Pool `Map<"ip:universe", { bufs: [pktA, pktB], flip }>` — double-buffer, 0 alloc
- Sequence ArtNet 1–255 par univers
- **Pas de Worker** : même process Node

### `artnet.js`

| Export | Rôle |
|--------|------|
| `ARTNET_PORT` | `6454` |
| `allocArtDmxPacket()` | Header Art-Net + 512 octets prérempli |
| `buildArtDmxInto(pkt, universe, dmx512, seq)` | Remplit in-place (hot path) |
| `buildArtDmx(...)` | Variante allouante (legacy / hors show) |
| `setChannel` / `setRgb` / `setRgbw` | Écriture dans un buffer 512 |
| `sendArtDmx` | Envoi one-shot (ex. `test-led`, blackout) |

### `watchdog.js`

```js
startWatchdog(bufferManager, receiver, { timeoutMs = 2000, graceMs = 5000 })
```

Grâce 5 s au démarrage → ensuite silence 2 s = blackout + `resetFrameCounters`.

### `config.js` / `profiles.js` / `paths.js`

| Module | Rôle |
|--------|------|
| `paths.js` | Chemins + `CONFIG_API_PORT = 6456` |
| `profiles.js` | `ensureMigrated`, `getActiveProfile`, `setActiveProfile`, CRUD profils |
| `config.js` | `loadConfig` / `saveConfig` / `validateConfig` sur le profil actif ; helpers `getProjector`, `getLyres` |

Layout profil :

```
config/profiles/<id>/mur-led.json
config/profiles/<id>/wall-bands.json
config/profiles/<id>/meta.json
config/active.json          → { "profile": "salle-b" }
```

### `wallBands.js` / `configServer.js`

```js
murLedToWallBands(config)   // segments rgb → { columns, bands: [{ column, entityStart, entityCount }] }
createConfigServer(getContext)
  GET /api/health
  GET /api/active-profile
  GET /api/wall-bands
  GET /api/mur-led
```

### `parseEcran.js`

Excel → objet config `mur-led` (+ dérivation wall-bands côté engine/tools).

### `lyre.js`

Constantes offsets DMX + `mapAuthoringShutterToDmx(shutter)`  
(`40` authoring → `255` fixture pour éviter le strobe).

### `blackout.js`

`blackoutAll(config, { repeat, hz })` — envoi ArtNet de buffers zéro (stop moteur / sécurité).

---

## 5. Structures de données clés

```text
config (mur-led.json)
  controllers[] : { ip, label, universeMin, universeMax }
  segments[]    : rgb | rgbw | moving_head

BufferManager
  entries : Map<"ip:univ", { ip, universe, buffer: Buffer(512) }>
  entityIndex : Map<entityId, { entry, channel, type }>
  dirty : Set<"ip:univ">

senderLoop
  packetPools : Map<"ip:univ", { bufs: [Buffer, Buffer], flip: 0|1 }>
  sequences   : Map<"ip:univ", number>
```

Taille typique : ~130 univers → ~130 × 512 ≈ **65 Ko** de buffers DMX (hors pools ArtNet).

---

## 6. Hot path — ce qu’il ne faut pas casser

Chemin critique par LED reçue :

1. `applyLedsChunkColors` (pas d’objets `{r,g,b}` temporaires)
2. `entityIndex.get(id)` O(1)
3. `setRgb` in-place
4. `dirty.add(key)`

Chemin critique par tick ArtNet :

1. `takeDirty()` ou `list()`
2. `buildArtDmxInto` dans un buffer du pool
3. `sock.send` (pas d’await, callback erreur seulement)

**À éviter dans ces chemins :** `JSON`, allocations massives, `resolveEntity` en boucle, `fs`, IPC Electron.

---

## 7. Couche Electron (hors hot path)

```
renderer/app.js
    → window.routing.*          (preload.js / contextBridge)
        → ipcRenderer.invoke
            → ipc.js handlers
                → RoutingEngine methods
```

Le renderer **ne touche jamais** aux sockets UDP directement. Il lit des snapshots (`dmxSnapshot`) et pilote start/stop/config.

Onglets UI ↔ code :

| Onglet | Principalement |
|--------|----------------|
| Dashboard | `engine.start/stop/blackout/status` |
| Moniteur DMX | `listUniverses` + `dmxSnapshot` |
| Installation | `profiles.*` + `importExcel` + wall-bands |
| Avancé | `getConfig` / `saveConfig` / `validateConfig` |

---

## 8. Outils CLI ↔ modules

| Tool | Modules touchés |
|------|-----------------|
| `router-cli.js` | engine-équivalent : receiver + sender + watchdog + configServer |
| `faker.js` | `protocol.encode*` uniquement (pas de DMX) |
| `test-led.js` | `resolve` + `artnet.sendArtDmx` (bypass state) |
| `parse-ecran.js` | `parseEcran` + `profiles` / save |
| `export-wall-bands.js` | `wallBands.deriveAndWriteWallBands` |
| `validate-config.js` | `config.validateConfig` |
| `sniffer.js` | socket UDP ArtNet brut (indépendant du moteur) |

---

## 9. Tests ↔ code couvert

| Test | Modules |
|------|---------|
| `protocol.test.js` | encode/decode LEDS/DEVS, frameId |
| `resolve.test.js` | mapping entités / devices |
| `dmxBuffers.test.js` | index, dirty, shutter, applyLeds |
| `artnet.test.js` | paquet ArtDmx |
| `stateReceiver.test.js` | reset session / frameId |
| `wallBands.test.js` | dérivation 128 colonnes |
| `parseEcran.test.js` | Excel → config |
| `profiles.test.js` | migration / activation |
| `configServer.test.js` | endpoints HTTP |

Lancer : `npm test` (nécessite souvent une config parsée).

---

## 10. Où modifier quoi (guide rapide)

| Besoin | Fichier(s) |
|--------|------------|
| Changer le format LEDS/DEVS | `protocol.js` + `protocole-state.md` + tests + faker |
| Optimiser l’envoi ArtNet | `senderLoop.js`, `artnet.js`, dirty dans `dmxBuffers.js` |
| Comportement lyre / shutter | `lyre.js`, `setDevice` dans `dmxBuffers.js` |
| Nouvel endpoint authoring | `configServer.js` |
| Nouveau profil / salle | UI Installation ou `profiles.js` + Excel |
| Watchdog plus agressif | options `timeoutMs` / `graceMs` (engine ou CLI) |
| Ajouter un type de fixture | segment dans config + branche `setDevice` / resolve |

---

## 11. Ordre de lecture du code (onboarding)

1. `docs/protocole-state.md` — contrat
2. `tools/faker.js` — émetteur minimal lisible
3. `src/core/stateReceiver.js` — entrée
4. `src/core/dmxBuffers.js` — mapping runtime
5. `src/core/senderLoop.js` + `artnet.js` — sortie
6. `src/main/engine.js` — collage de tout
7. `tools/router-cli.js` — point d’entrée show
8. `src/core/profiles.js` + `configServer.js` — config / sync Unity

---

## 12. Liens

| Doc | Contenu |
|-----|---------|
| [documentation-generale.md](./documentation-generale.md) | Vue produit, workflows, matériel |
| [protocole-state.md](./protocole-state.md) | Spec binaire LEDS/DEVS |
| [implementation/](./implementation/) | Plans (profils, perf, contrat authoring) |
| `../README.md` | Démarrage rapide |

---

*Dernière mise à jour : 23 juillet 2026 — alignée sur `src/core` + `RoutingEngine` actuels.*
