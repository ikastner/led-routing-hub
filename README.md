# LED Routing Hub

Application de routage ArtNet/DMX vers les contrôleurs BC216 Glassworks.

- **Entrée** : protocole state maison (`LEDS` + `DEVS`) sur UDP `:6455`
- **Sortie** : ArtNet UDP `:6454` à 40 Hz
- **UI** : Electron (config, moniteur DMX, dashboard)

## Démarrage rapide

```bash
npm install

# Générer / valider la config depuis mapping/Ecran.xlsx
npm run parse
npm run validate

# Test matériel — 1 LED (WiFi GLASS_RESEAUX)
npm run test-led -- --entity 100 --color 255,0,0

# Moteur CLI (sans Electron)
npm run router

# Faker state (autre terminal)
npm run faker -- --duration 30

# Application Electron
npm start

# Tests unitaires
npm test
```

## Documentation

- **[docs/documentation-generale.md](docs/documentation-generale.md)** — vue d’ensemble du projet, architecture, modules, config, workflows
- [docs/protocole-state.md](docs/protocole-state.md) — contrat réseau authoring ↔ routing (LEDS + DEVS)
- [Politique IA (équipe projet)](../POLITIQUE-IA.md) — gouvernance usage IA, données, revue, divulgation

## Matériel

- WiFi : `GLASS_RESEAUX` / `networks`
- 4 BC216 : `192.168.1.45` – `.48`
- Mur LED : entités 100 – 19858
