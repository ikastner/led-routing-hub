# Contrat Routing Hub ↔ Authoring

## Principe

| App | Responsable de… | Ne touche jamais à… |
|-----|-----------------|---------------------|
| **led-routing-hub** | Excel, IP, univers, DMX, lyres, projecteur, `mur-led.json`, profils | Canvas, clips, musique |
| **led-studio-editor / Unity** | Scène, timeline, couleurs, preview | Mapping DMX |

Le lien entre les deux = **entity IDs** + fichier **`wall-bands.json` dérivé** du profil actif.

## Flux cible

```
Excel (Ecran.xlsx)
    → parse (CLI ou UI Hub)
    → mur-led.json  (source de vérité physique)
    → wall-bands.json  (vue authoring, dérivée)

Studio / Unity
    → GET http://hub:6456/api/wall-bands   (config — profil actif)
       (fallback : dernier cache local / fichier exporté)
    → UDP LEDS :6455                       (state — couleurs)
    → Hub → ArtNet :6454 → BC216
```

Deux canaux distincts :

| Canal | Port (défaut) | Contenu |
|-------|---------------|---------|
| Config | HTTP **6456** | `wall-bands`, profil actif, health |
| State | UDP **6455** | frames `LEDS` / `DEVS` |

## Schéma `wall-bands.json` (dérivé)

```json
{
  "columns": 128,
  "generatedFrom": "profiles/glassworks-paris/mur-led.json",
  "profile": "glassworks-paris",
  "bands": [
    { "column": 0, "entityStart": 100, "entityCount": 170 },
    { "column": 1, "entityStart": 270, "entityCount": 89 }
  ]
}
```

Règles de dérivation depuis `mur-led.json` :

1. Prendre les segments `type === "rgb"` **dans l’ordre du fichier** (ou triés par `entityStart`).
2. `column` = index 0..N-1.
3. `entityStart` / `entityCount` = champs du segment (`entityCount` ou `entityEnd - entityStart + 1`).
4. `columns` = nombre de bandes rgb.
5. Ignorer `moving_head` et `rgbw` (lyres / projecteur) — hors contrat mur.

## Protocole réseau (inchangé)

- Port state : **UDP 6455**
- Magic : `LEDS` (mur) / `DEVS` (devices, plus tard côté studio)
- Full state ~40 Hz, max **400** entrées / chunk
- Spec : [`../protocole-state.md`](../protocole-state.md)

## API config (Hub → authoring)

| Méthode | Chemin | Usage |
|---------|--------|--------|
| `GET` | `/api/health` | Hub joignable ? |
| `GET` | `/api/active-profile` | Quel profil est actif |
| `GET` | `/api/wall-bands` | Mapping à appliquer dans Studio / Unity |

Si le Hub est down : conserver le **dernier mapping en cache** (ne pas bloquer l’authoring hors ligne).

## Ce que le Studio / Unity ne doivent pas faire

- Éditer IP / univers / canaux DMX
- Parser l’Excel
- Maintenir une copie “source” de `wall-bands` indépendante du Hub (cache OK, source non)
