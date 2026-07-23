# LED Routing Hub

Application de routage ArtNet/DMX vers les contrôleurs BC216 Glassworks.

- **Entrée** : protocole state maison (`LEDS` + `DEVS`) sur UDP `:6455`
- **Sortie** : ArtNet UDP `:6454` à 40 Hz
- **Config API** : HTTP `:6456` (`/api/wall-bands` pour Studio / Unity)
- **UI** : Electron (config, moniteur DMX, dashboard)

## Démarrage rapide

```bash
npm install

# Générer mur-led.json + wall-bands.json depuis mapping/Ecran.xlsx
npm run parse
npm run validate
npm run export:wall-bands   # régénère config/wall-bands.json seul

# Test matériel — 1 LED (WiFi GLASS_RESEAUX)
npm run test-led -- --entity 100 --color 255,0,0

# Moteur CLI (sans Electron) — state :6455 + config API :6456
npm run router

# Récupérer le mapping authoring (autre terminal)
curl http://127.0.0.1:6456/api/wall-bands

# Faker state (autre terminal)
npm run faker -- --duration 30

# Application Electron (API config démarrée au lancement)
npm start

# Tests unitaires
npm test
```

## Documentation

- **[docs/documentation-generale.md](docs/documentation-generale.md)** — vue d’ensemble du projet, architecture, modules, config, workflows
- **[docs/architecture-code.md](docs/architecture-code.md)** — carte du code, hot path, APIs des modules
- [docs/protocole-state.md](docs/protocole-state.md) — contrat réseau authoring ↔ routing (LEDS + DEVS)
- [docs/implementation/](docs/implementation/) — plans d’implémentation (profils, sync authoring, API)
- [Politique IA (équipe projet)](../POLITIQUE-IA.md) — gouvernance usage IA, données, revue, divulgation

## Matériel

- WiFi : `GLASS_RESEAUX` / `networks`
- 4 BC216 : `192.168.1.45` – `.48`
- Mur LED : entités 100 – 19858
