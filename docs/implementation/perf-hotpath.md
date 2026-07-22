# Perf hot path — LEDS → DMX → ArtNet

Branche : `feature/perf-hotpath`

## Objectif

Réduire le CPU Node sous full wall 40 Hz (~16 576 LEDs, ~130 univers) **sans** changer le protocole UDP ni l’API config.

## Changements

| Zone | Avant | Après |
|------|--------|--------|
| Resolve | scan linéaire segments / LED | `Map` entityId → slot DMX au load |
| Dirty | `list().filter` + clear async worker | `takeDirty()` O(dirty) sync |
| Decode LEDS | tableau `{r,g,b}[]` | `applyLedsChunkColors` offsets bruts |
| Sender | worker + `Buffer.from` + `postMessage` | même process, double-buffer ArtNet in-place |

## Show path recommandé

Pour un spectacle : **`npm run router`** (CLI Node), pas Electron.

```bash
npm run router -- --dry-run   # sans ArtNet
npm run faker                 # autre terminal
```

## Hors scope

- Protocole delta LEDS (authoring)
- Benchmarks CI

## Suite authoring

Voir `led-editor/LED/Docs/perf-state-exporter.md` (buffers préalloués + horloge Unity).
