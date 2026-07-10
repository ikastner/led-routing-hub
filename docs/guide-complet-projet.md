# Guide complet — LED Routing Hub

## 1. Le contexte en 30 secondes

**LED Routing Hub** est le **module de routage** (P4) d’une installation son et lumière Glassworks. Il fait le pont entre :

| Logiciel | Rôle |
|----------|------|
| **Authoring** (autre dépôt) | Crée le spectacle : couleurs, animations, mouvements des lyres |
| **Routing Hub** (ce projet) | Traduit l’état logique en **DMX/ArtNet** pour le matériel |
| **4× BC216** | Contrôleurs qui reçoivent l’ArtNet et pilotent le DMX physique |

L’authoring **ne parle pas** directement aux BC216. Il envoie un **protocole maison** sur **UDP port 6455** (`LEDS` + `DEVS`). Le routing le décode, consulte le mapping physique, et renvoie de l’**ArtNet** sur le port **6454** à **40 Hz**.

**Analogie** : l’authoring envoie une liste de courses (*« entité 100 = rouge, lyre 2 = pan 128 »*). Le routing sait où se trouve chaque produit en magasin (*« entité 100 → BC216 .45, univers 0, canal DMX 1 »*).

```
Authoring  ──UDP :6455 (LEDS + DEVS)──►  LED Routing Hub  ──UDP :6454 (ArtNet)──►  4× BC216
   (créatif)         état logique              (traduction)           512 canaux/univ      (matériel)
```

---

## 2. Vocabulaire à connaître pour le prof

| Terme | Définition simple |
|-------|-------------------|
| **Routing** | Traduction entité logique → adresse DMX physique |
| **Authoring** | Logiciel créatif qui produit le spectacle (repo séparé) |
| **Entité (entityId)** | ID logique d’un pixel du mur (100–~19 858) ou du projecteur (1) |
| **deviceId** | ID logique d’un appareil mobile : 0 = projecteur, 1–4 = lyres |
| **Segment** | Plage d’entités mappée sur un univers/canaux DMX dans `mur-led.json` |
| **Univers DMX** | Bloc de 512 canaux adressés ensemble sur un BC216 |
| **Buffer DMX** | Tableau de 512 octets (0–255) représentant un univers |
| **Dirty** | Univers modifié depuis le dernier envoi ArtNet |
| **ArtNet** | Protocole UDP standard (port 6454) pour transporter du DMX sur Ethernet |
| **BC216** | Contrôleur Glassworks qui convertit ArtNet → DMX physique |
| **Full state** | Chaque frame contient **tout** l’état, pas seulement les changements |
| **Chunk** | Morceau d’un gros message LEDS (le mur est trop grand pour un seul paquet UDP) |
| **frameId** | Numéro de frame (0–65535, puis repart à 0) |
| **Watchdog** | Sécurité : extinction si plus de paquets state pendant 2 s |
| **Blackout** | Mise à zéro de tous les canaux (extinction) |
| **Dry-run** | Mode simulation : le moteur tourne sans envoyer d’ArtNet réel |
| **Magic bytes** | 4 caractères ASCII en début de paquet (`LEDS` ou `DEVS`) |

---

## 3. Matériel visé

| Élément | Détail |
|---------|--------|
| WiFi | `GLASS_RESEAUX` / mot de passe `******` |
| Contrôleurs | 4× BC216 : `192.168.1.45` à `.48` |
| Mur LED | 128×128 = **16 576 pixels** → entités **100** à **~19 858** |
| Projecteur RGBW | Entité logique **1** (4 canaux DMX) |
| Lyres | **4** lyres (deviceId **1–4** dans DEVS, 14 canaux chacune) |
| Fréquence | **40 Hz** (entrée state et sortie ArtNet = 1 frame toutes les **25 ms**) |

### Repères de mapping (mémo)

| Entité | Contrôleur | Zone mur |
|--------|------------|----------|
| 100 | 192.168.1.45 | Quart **gauche**, haut |
| ~5100 | 192.168.1.46 | Centre-gauche |
| ~10100 | 192.168.1.47 | Centre-droit |
| ~15100 | 192.168.1.48 | Quart **droit** |

Projecteur + lyres : tous sur **192.168.1.48 univers 33**.

---

## 4. Structure du dépôt

```
led-routing-hub/
├── config/
│   └── mur-led.json          # Mapping physique (~1750 lignes, généré depuis Excel)
├── mapping/
│   └── Ecran.xlsx            # Source du mapping (128 bandes + devices)
├── docs/
│   ├── guide-complet-projet.md   # ← ce document
│   ├── documentation-generale.md # Vue d’ensemble technique
│   └── protocole-state.md        # Contrat réseau LEDS/DEVS
├── src/
│   ├── core/                 # Cœur du routing (Node.js pur, zéro dépendance runtime)
│   ├── main/                 # Process Electron (main + moteur)
│   └── renderer/             # Interface graphique (HTML/CSS/JS)
├── tools/                    # Scripts CLI (router, faker, tests matériel…)
└── tests/                    # Tests unitaires Node (--test natif)
```

---

## 5. Architecture logicielle — les 3 couches

```
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE UI (Electron)                                           │
│  index.html + app.js + styles.css                               │
│  Dashboard | Moniteur DMX | Configuration                         │
└───────────────────────────┬─────────────────────────────────────┘
                            │ IPC (preload.js → ipc.js)
┌───────────────────────────▼─────────────────────────────────────┐
│  COUCHE MOTEUR (src/main/)                                      │
│  RoutingEngine (engine.js) — assemble receiver + sender + WD    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│  COUCHE CORE (src/core/) — le cœur métier                       │
│  stateReceiver → dmxBuffers → resolve → senderLoop → artnet       │
└─────────────────────────────────────────────────────────────────┘
```

### Principe clé : séparation des responsabilités

| Couche | Sait quoi | Ne sait pas |
|--------|-----------|-------------|
| **Authoring** | Couleurs, animations, lyres, timing | IP des BC216, canaux DMX |
| **Routing (ici)** | Mapping entité → DMX, protocole ArtNet | Contenu créatif du spectacle |
| **Config** (`mur-led.json`) | Installation physique actuelle | Ce qui est affiché à l’écran |

---

## 6. Flux de données complet — étape par étape

```
t=0 ms    Authoring calcule l'état frame N (couleurs mur + positions lyres)

t=0–20 ms Authoring envoie en rafale UDP :6455 :
          ├─ LEDS chunk 0/50  (frameId=N, entités 100–499)
          ├─ LEDS chunk 1/50  (frameId=N, entités 500–899)
          ├─ …
          ├─ LEDS chunk 49/50 (frameId=N, dernières entités)
          └─ DEVS             (frameId=N, 5 devices)

t=0–25 ms Routing reçoit chaque paquet (stateReceiver.js) :
          ├─ Lit magic → route vers protocol.js
          ├─ Décode → objet JavaScript
          ├─ Filtre frameId obsolètes
          └─ Écrit dans dmxBuffers.js (via resolve.js + mur-led.json)

t=0–25 ms senderLoop.js tick à 40 Hz :
          ├─ Récupère univers « dirty » (modifiés)
          ├─ Tous les 10 ticks : envoie TOUS les univers (filet de sécurité)
          └─ Délègue l'envoi UDP au worker thread (senderWorker.js)

t=0–25 ms watchdog.js vérifie toutes les 500 ms :
          └─ Si aucun paquet depuis 2 s → blackoutAll()

t=25 ms   Frame N+1 recommence (frameId incrémenté)
```

---

## 7. Le protocole state (LEDS + DEVS) — résumé

Transport : **UDP port 6455**, **40 Hz**, **little-endian**.

| Message | Contenu | Taille typique | Magic |
|---------|---------|----------------|-------|
| `LEDS` | Couleurs RGB du mur (chunked) | ~50 paquets/frame | `4C 45 44 53` |
| `DEVS` | Projecteur + 4 lyres | 1 paquet/frame (~93 octets) | `44 45 56 53` |

### Pourquoi deux messages ?

- **LEDS** : 16 576 pixels × 3 octets ≈ **50 Ko** → impossible en un seul UDP → **chunking** (max 400 entités/paquet)
- **DEVS** : 5 devices × 16 octets = **80 octets** → tient dans **un seul paquet**

### Règles essentielles

1. **Full state** : chaque frame 40 Hz contient toutes les entités — pas de delta
2. **Même frameId** pour tous les chunks LEDS d’une frame
3. **frameId LEDS** et **frameId DEVS** sont des compteurs **séparés** côté routing
4. Paquets avec un **frameId trop ancien** → **ignorés** (comparaison modulo 65536)
5. Le routing **ne vérifie pas** que tous les chunks sont arrivés

**Spec complète binaire** : [protocole-state.md](./protocole-state.md)

---

## 8. Le cœur métier — module par module

### 8.1 `protocol.js` — Encode / decode binaire

- **`decodeLedsChunk(buffer)`** → `{ frameId, chunkIndex, chunkCount, startEntityId, colors[] }`
- **`decodeDevsState(buffer)`** → `{ frameId, deviceCount, devices[] }`
- **`encodeLedsChunk()` / `encodeDevsState()`** — utilisés par `faker.js`
- **`getAllLedChunks()`** — découpe tout le mur en chunks de 400 entités max
- Constantes : `STATE_PORT = 6455`, `LEDS_MAGIC`, `DEVS_MAGIC`

### 8.2 `stateReceiver.js` — Entrée UDP

- Ouvre un socket UDP sur le port **6455**
- Lit les 4 premiers octets (**magic**) → route vers `handleLeds()` ou `handleDevs()`
- Filtre les **frameId** obsolètes (compteurs séparés LEDS / DEVS)
- Met à jour `lastPacketAt` (utilisé par le watchdog)
- Log toutes les secondes : paquets/s, frames appliquées

### 8.3 `resolve.js` — Entité logique → adresse physique

```javascript
// Exemple : entité 100
resolveEntity(100, segments) → {
  entityId: 100,
  type: "rgb",
  controllerIp: "192.168.1.45",  // BC216 n°1 = quart gauche
  universe: 0,
  dmxChannel: 1,                  // canal DMX du R (G=2, B=3)
  channels: ["r", "g", "b"]
}
```

**Formule pour un pixel LED** :
```
pixelIndex = entityId - segment.entityStart
canal DMX  = segment.dmxChannelStart + pixelIndex × 3
```

Fonctions :
- **`resolveEntity(entityId, segments)`** — mur LED + projecteur (via entité 1)
- **`resolveLyre(index, config)`** — lyre 1–4 → 14 canaux DMX
- **`resolveProjector(config)`** — raccourci vers entité 1

### 8.4 `dmxBuffers.js` — Stockage DMX en mémoire

- Un **`Buffer(512)`** par couple **(IP contrôleur, univers DMX)**
- ~**130 buffers** au total (4 contrôleurs × ~32 univers)
- **`setEntityColor(entityId, r, g, b)`** — résout l’entité, écrit RGB/RGBW, marque dirty
- **`setDevice(deviceId, channels)`** — deviceId 0 = projecteur RGBW, 1–4 = lyres
- **`blackoutAll()`** — remplit tous les buffers à 0
- **`listDirty()` / `clearDirty()`** — optimisation envoi ArtNet
- **`getSnapshot(ip, universe)`** — pour le moniteur DMX de l’UI

### 8.5 `artnet.js` — Construction paquets Art-Net

- **`buildArtDmxPacket(universe, buffer)`** — en-tête Art-Net + 512 valeurs DMX
- **`setRgb()` / `setRgbw()` / `setChannel()`** — écriture dans un buffer
- Port sortant : **6454**

### 8.6 `senderLoop.js` + `senderWorker.js` — Sortie ArtNet

- Boucle **40 Hz** (intervalle 25 ms)
- Récupère les univers **dirty** (modifiés)
- Tous les **10 ticks** : envoie **tous** les univers (filet de sécurité)
- L’envoi UDP est délégué à un **worker thread** pour ne pas bloquer le receiver ni l’UI
- Mode **`dryRun`** : log sans envoi réseau

### 8.7 `watchdog.js` — Sécurité

| Paramètre | Valeur |
|-----------|--------|
| Timeout | **2 secondes** sans paquet |
| Période de grâce au démarrage | **5 secondes** |
| Vérification | Toutes les **500 ms** |

Si timeout → `blackoutAll()` + log d’avertissement. Reprend dès que les paquets reviennent.

### 8.8 `blackout.js` — Extinction

- Met tous les buffers à 0
- Envoie les paquets ArtNet de blackout (avec répétitions à l’arrêt : 5–8 fois)
- Déclenché par : watchdog, bouton UI, `Ctrl+C` sur le router CLI

### 8.9 `lyre.js` — Profil DMX des lyres

14 canaux par lyre (offsets relatifs au `dmxChannelStart`) :

| Offset | Canal | Description |
|--------|-------|-------------|
| 0 | pan | Pan coarse |
| 1 | panFine | Pan fine |
| 2 | tilt | Tilt coarse |
| 3 | tiltFine | Tilt fine |
| 4 | dimmer | Intensité (255 = full) |
| 5 | shutter | 40 = ouvert |
| 6 | colorWheel | Roue couleur |
| 7 | r | Rouge |
| 8–13 | g, b, aux… | Certains forcés à 0 à l’écriture |

Constantes : `DIMMER_FULL = 255`, `SHUTTER_OPEN = 40`, `CENTER = 128`

### 8.10 `config.js` — Chargement configuration

- **`loadConfig()`** — lit `config/mur-led.json`
- **`saveConfig()` / `validateConfig()`** — persistance + validation
- **`getLyres()` / `getProjector()`** — accesseurs segments
- **`printInstallInfo()`** — résumé console au démarrage

---

## 9. La configuration `mur-led.json`

Fichier central généré par `npm run parse` depuis `mapping/Ecran.xlsx`.

### Structure

```json
{
  "version": 1,
  "generatedFrom": "mapping/Ecran.xlsx",
  "controllers": [ /* 4 BC216 avec IP, label, universeMin/Max */ ],
  "segments": [ /* 128 bandes LED + 4 lyres + 1 projecteur */ ],
  "stats": { "ledEntityCount": 16576, "segmentCount": 133 }
}
```

### Trois types de segments

| Type | Exemple | Entités | Canaux |
|------|---------|---------|--------|
| `rgb` | Bande mur LED | 100–~19858 | 3 (R,G,B) |
| `rgbw` | Projecteur | entité 1 | 4 (R,G,B,W) |
| `moving_head` | Lyre 1–4 | deviceId 1–4 | 14 |

### Exemple segment RGB

```json
{
  "name": "1",
  "type": "rgb",
  "entityStart": 100,
  "entityEnd": 269,
  "entityCount": 170,
  "controllerIp": "192.168.1.45",
  "universe": 0,
  "dmxChannelStart": 1,
  "channelsPerEntity": 3
}
```

Validation (`npm run validate`) : IPs uniques, pas de chevauchement de canaux, max canal 512.

---

## 10. Le moteur — `RoutingEngine` (`engine.js`)

Classe centrale qui assemble tous les modules :

```javascript
async start(options) {
  this.config = loadConfig();
  this.bufferManager = createBufferManager(this.config);
  this.receiver = startStateReceiver(this.bufferManager, { port: 6455 });
  this.sender = startSenderLoop(this.bufferManager, { hz: 40, dryRun });
  this.watchdog = startWatchdog(this.bufferManager, this.receiver, { timeoutMs: 2000 });
}

async stop() {
  // Arrêt propre + blackout ArtNet (5 répétitions)
}
```

Options par défaut : port **6455**, **40 Hz**, watchdog **2000 ms**, dryRun **false**.

Utilisé par :
- L’application **Electron** (via IPC)
- Le script CLI **`router-cli.js`** (version standalone sans UI)

---

## 11. L’application Electron

### Démarrage

```bash
npm install
npm start
```

### 3 onglets

| Onglet | Fonction |
|--------|----------|
| **Dashboard** | Start/Stop moteur, dry-run, blackout manuel, stats JSON live |
| **Moniteur DMX** | Grille 512 canaux pour un univers choisi (debug visuel) |
| **Configuration** | Éditeur JSON de `mur-led.json` avec validation intégrée |

### Pont UI ↔ moteur

```
renderer/app.js  →  window.routing.*  →  preload.js  →  ipc.js  →  RoutingEngine
```

API exposée (`preload.js`) :

| Méthode | Action |
|---------|--------|
| `start({ dryRun })` | Démarre le moteur |
| `stop()` | Arrête + blackout |
| `status()` | Stats JSON (receiver, sender, watchdog) |
| `blackout()` | Extinction manuelle |
| `getConfig()` / `saveConfig()` / `validateConfig()` | Gestion config |
| `listUniverses()` | Liste IP + univers |
| `dmxSnapshot(ip, universe)` | 512 valeurs pour le moniteur |

---

## 12. Outils CLI (`tools/`)

| Script | Commande npm | Usage |
|--------|--------------|-------|
| `router-cli.js` | `npm run router` | Moteur sans Electron (production ou dev) |
| `faker.js` | `npm run faker` | Simule l’authoring (rainbow, lyres animées) |
| `test-led.js` | `npm run test-led` | Allume **une** entité LED en direct ArtNet |
| `parse-ecran.js` | `npm run parse` | Génère `mur-led.json` depuis Excel |
| `validate-config.js` | `npm run validate` | Vérifie la cohérence de la config |
| `sniffer.js` | `npm run sniffer` | Écoute le trafic ArtNet entrant |

### Options utiles

```bash
# Router en simulation (pas d'ArtNet réel)
npm run router -- --dry-run

# Faker : couleur fixe, durée limitée, sans lyres
npm run faker -- --duration 10 --color 255,0,0 --no-devices

# Test matériel : une LED sur le mur
npm run test-led -- --entity 100 --color 255,0,0

# Régénérer la config après modif Excel
npm run parse && npm run validate
```

---

## 13. Cas particuliers importants

### Projecteur : deux chemins possibles

| Chemin | Comment |
|--------|---------|
| Via **LEDS** | Entité logique **1** (couleur RGBW) |
| Via **DEVS** | `deviceId: 0` dans un paquet DEVS |

Les deux arrivent à `setEntityColor(1, …)` ou `setDevice(0, …)` → même résultat DMX sur **192.168.1.48 univers 33 canaux 1–4**.

### Lyres : uniquement via DEVS

- `deviceId` **1 à 4** → `resolveLyre()` → 14 canaux DMX écrits dans le buffer
- Canaux G et B forcés à 0 à l’écriture (sécurité matériel)

### Watchdog + blackout à l’arrêt

| Déclencheur | Comportement |
|-------------|-------------|
| 2 s sans paquet state | Blackout automatique (buffers → 0) |
| Bouton UI « Blackout » | Extinction immédiate |
| `Ctrl+C` sur router CLI | Arrêt propre + 8 répétitions blackout ArtNet |
| Stop Electron | Idem (5 répétitions) |

---

## 14. Tests unitaires

```bash
npm test
```

| Fichier | Ce qui est testé |
|---------|-----------------|
| `protocol.test.js` | Encode/decode LEDS et DEVS, frameId, chunking |
| `resolve.test.js` | Entité 100 → .45, entité 15100 → .48, lyres, projecteur |
| `dmxBuffers.test.js` | Écriture couleurs dans les buffers, dirty tracking |
| `artnet.test.js` | Construction paquets ArtDmx |

Les tests chargent la vraie config `mur-led.json` — lancer `npm run parse` au préalable si absent.

---

## 15. Choix techniques (pourquoi c’est fait ainsi)

1. **Full state, pas de delta** — simplicité ; un paquet perdu se corrige à la frame suivante (~25 ms)
2. **Chunking LEDS (400 entités max)** — respecte la MTU UDP (~1213 octets/paquet)
3. **Worker thread pour ArtNet** — l’envoi UDP ne bloque pas le receiver ni l’UI Electron
4. **Envoi dirty + refresh complet /10 ticks** — optimise le trafic tout en garantissant la cohérence
5. **Zéro dépendance npm runtime** — seul Electron en devDependency ; le cœur tourne avec **Node 18+** pur
6. **Config JSON externalisée** — changer une IP = éditer JSON, pas recompiler
7. **Protocole maison UDP** — découplage total authoring ↔ routing ; l’authoring ne connaît que des IDs logiques

---

## 16. Workflows courants

### A. Développement local (sans matériel)

```bash
# Terminal 1 — moteur en dry-run
npm run router -- --dry-run

# Terminal 2 — simule l'authoring
npm run faker -- --duration 30 --pattern rainbow
```

### B. Test d’une LED sur le mur

Connecté au WiFi `GLASS_RESEAUX` :

```bash
npm run test-led -- --entity 100 --color 255,0,0
```

### C. Production (spectacle réel)

1. Lancer le routing : `npm run router` ou `npm start`
2. L’authoring envoie LEDS+DEVS vers `IP_du_routing:6455`
3. Le watchdog garantit l’extinction si l’authoring plante

### D. Debug réseau ArtNet

```bash
npm run sniffer
```

---

## 17. Dépannage

| Symptôme | Cause probable | Action |
|----------|---------------|--------|
| `Config introuvable` | Pas de `mur-led.json` | `npm run parse` |
| Mur reste noir | Authoring non lancé ou mauvaise IP/port | Vérifier faker ou authoring sur `:6455` |
| Mur figé coloré | Authoring a planté | Normal après 2 s → blackout ; vérifier logs |
| Une LED ne s’allume pas | Mauvaise entité ou pas sur le bon WiFi | `npm run test-led -- --entity N` |
| Config invalide | Chevauchement canaux | `npm run validate`, corriger segments |
| Pas d’ArtNet vu | Dry-run activé ou mauvais réseau | Désactiver dry-run, `npm run sniffer` |

---

## 18. Comment l’expliquer au prof — script oral

> « **LED Routing Hub** est notre module de routage (P4) pour l’installation Glassworks. Il reçoit l’état logique du spectacle via un **protocole UDP maison** sur le port **6455** à **40 Hz**, et le traduit en **ArtNet** sur le port **6454** vers **4 contrôleurs BC216**.
>
> Le protocole comprend **deux types de datagrammes** :
> - **`LEDS`** : couleurs RGB du mur (16 576 pixels) en **full state**, découpé en **~50 chunks** de 400 entités max
> - **`DEVS`** : projecteur RGBW + 4 lyres en **un seul paquet** de 16 octets par device
>
> Côté routing, le **`stateReceiver`** écoute le port 6455, **`protocol.js`** décode le binaire, **`dmxBuffers.js`** résout chaque entité en adresse DMX via **`resolve.js`** et la config **`mur-led.json`** (~130 buffers de 512 octets), puis **`senderLoop.js`** envoie en ArtNet via un **worker thread** à 40 Hz.
>
> On a un **watchdog** qui coupe tout si l’authoring s’arrête (2 s sans paquet), une **UI Electron** pour monitorer et configurer, et des **outils CLI** pour tester sans matériel (`faker`, `test-led`, `sniffer`).
>
> L’authoring (repo séparé) ne connaît **jamais** les IP ni les canaux DMX — seulement des **entityId** (100+) et **deviceId** (0–4). C’est le routing qui fait la traduction physique. »

---

## 19. Fichiers à citer si le prof demande « où c’est implémenté ? »

| Fichier | Rôle |
|---------|------|
| `docs/protocole-state.md` | Spécification du contrat réseau |
| `docs/documentation-generale.md` | Vue d’ensemble technique détaillée |
| `src/main/engine.js` | Orchestration (RoutingEngine) |
| `src/core/protocol.js` | Encode / decode LEDS + DEVS |
| `src/core/stateReceiver.js` | Réception UDP :6455 |
| `src/core/dmxBuffers.js` | Stockage buffers 512 octets |
| `src/core/resolve.js` | entityId → IP/univers/canal |
| `src/core/senderLoop.js` | Boucle 40 Hz + worker thread |
| `src/core/artnet.js` | Construction paquets Art-Net |
| `src/core/watchdog.js` | Blackout automatique |
| `src/core/lyre.js` | Profil DMX 14 canaux lyres |
| `config/mur-led.json` | Mapping physique (généré) |
| `mapping/Ecran.xlsx` | Source Excel du mapping |
| `tools/faker.js` | Encodeur de référence (simule l’authoring) |
| `tools/router-cli.js` | Moteur CLI standalone |
| `tools/test-led.js` | Test matériel une LED |
| `src/renderer/app.js` | Interface Electron |
| `tests/protocol.test.js` | Tests round-trip encode/decode |

### Ordre de lecture recommandé

1. `docs/protocole-state.md` — le contrat réseau
2. `src/main/engine.js` — orchestration
3. `src/core/stateReceiver.js` — entrée UDP
4. `src/core/dmxBuffers.js` + `resolve.js` — cœur du mapping
5. `src/core/senderLoop.js` — sortie ArtNet
6. `tools/faker.js` — exemple complet d’émetteur state
7. `config/mur-led.json` — vérité terrain du mapping

---

## 20. Test rapide pour valider ta compréhension

```bash
# Terminal 1 — routing (simulation)
npm run router -- --dry-run

# Terminal 2 — simule l'authoring
npm run faker -- --duration 5 --color 255,0,0
```

Tu dois voir dans les logs du router :
- `[receiver] écoute UDP :6455 (LEDS + DEVS)`
- `[receiver] X pkt/s | LED frame=N | DEVS frame=N`
- `[sender] X tick(s), ~Y paquets ArtNet (dry-run)`

Pour tester avec l’UI :

```bash
npm start
# → Dashboard → Start → lancer le faker dans un autre terminal
# → Moniteur DMX → choisir un univers → voir les canaux s’animer
```

---

## 21. Relation avec l’authoring

Ce repo est **uniquement le routing (P4)**. L’authoring (timeline, effets, vidéos) vit dans un **autre dépôt** et communique via le protocole UDP décrit ci-dessus.

Pour brancher un vrai authoring :

1. Implémenter l’envoi `LEDS` (tous chunks) + `DEVS` à 40 Hz
2. Cibler l’IP de la machine qui tourne `npm run router`
3. Port **6455**
4. Utiliser les entityId/deviceId de la config — **jamais** les IP ou canaux DMX

Le `tools/faker.js` joue le rôle de l’authoring minimal pour les tests.

---

*Dernière mise à jour : juillet 2026 — dépôt `led-routing-hub` tel qu’il existe dans le workspace.*
