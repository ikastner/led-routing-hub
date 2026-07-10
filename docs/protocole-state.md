# Protocole State — contrat authoring ↔ routing

Transport : **UDP port 6455**  
Fréquence cible : **40 Hz**  
Endianness : **little-endian** pour les entiers multi-octets

Le module d'authoring envoie l'état logique (entités + couleurs). Le routing traduit vers ArtNet/DMX. L'authoring ne connaît ni les IP, ni les univers, ni les canaux DMX.

---

## Message `LEDS` — mur LED

| Offset | Taille | Champ |
|--------|--------|-------|
| 0 | 4 | Magic `LEDS` (ASCII) |
| 4 | 1 | Version = `1` |
| 5 | 2 | `frameId` (uint16 LE) |
| 7 | 1 | `chunkIndex` (uint8, 0 … chunkCount-1) |
| 8 | 1 | `chunkCount` (uint8, max 255) |
| 9 | 2 | `startEntityId` (uint16 LE) |
| 11 | 2 | `entryCount` (uint16 LE) |
| 13 | 3×N | Entrées RGB : `[R][G][B]` pour entités `startEntityId` … `startEntityId+N-1` |

### Règles

- **Full state** : chaque trame contient toutes les entités (pas de delta). Obligation **côté authoring** — le routing n’en vérifie pas la complétude.
- **Chunking** : max **400** entrées par datagramme (~1213 octets). Tous les chunks d’une même trame partagent le **même `frameId`**.
- **frameId** : incrémenté à chaque trame complète LEDS (modulo 65536). Compteur **indépendant** de celui des paquets `DEVS`.
- Couleurs : octets 0–255.

### Exemple

Trame pour entités 100–102 (rouge, vert, bleu) :

```
4C 45 44 53  01  05 00  00 01  64 00  03 00  FF 00 00  00 FF 00  00 00 FF
LEDS         v1  fid=5     c0/1  e100  n=3   R G B     R G B     R G B
```

---

## Message `DEVS` — projecteur + lyres

| Offset | Taille | Champ |
|--------|--------|-------|
| 0 | 4 | Magic `DEVS` (ASCII) |
| 4 | 1 | Version = `1` |
| 5 | 2 | `frameId` (uint16 LE) |
| 7 | 1 | `deviceCount` (uint8, max 255) |
| 8 | 16×N | Blocs device (voir ci-dessous) |

### Bloc device (16 octets)

| Offset | Champ |
|--------|-------|
| 0 | `deviceId` : `0` = projecteur RGBW, `1`–`4` = lyres |
| 1 | pan |
| 2 | panFine |
| 3 | tilt |
| 4 | tiltFine |
| 5 | dimmer |
| 6 | shutter |
| 7 | colorWheel (alias encodeur : `colorMacro`) |
| 8 | R |
| 9 | G |
| 10 | B |
| 11 | W |
| 12 | moveSpeed |
| 13 | function |
| 14–15 | réservé (0) |

---

## Ordre d'envoi recommandé (40 Hz)

1. Tous les chunks `LEDS` (chunkIndex 0 … chunkCount-1)
2. Un paquet `DEVS`

---

## Comportement du receiver (`stateReceiver.js`)

- **`frameId` séparés** : le routing suit un compteur pour `LEDS` et un autre pour `DEVS`. Ils peuvent différer dans la même période 40 Hz.
- **Chunks d’une même trame** : tous les paquets `LEDS` avec le même `frameId` sont acceptés (ex. chunks 0…49 d’une frame). Seuls les paquets dont le `frameId` est **strictement plus ancien** sont ignorés.
- **Wrap-around** : comparaison modulo 65536 (un `frameId` proche de 0 est considéré plus récent que 65535).
- **Pas de validation d’ordre** : le receiver applique les paquets à l’arrivée ; il ne vérifie ni l’ordre des chunks ni qu’ils sont tous présents.
- **Version** : seule la version `1` est acceptée ; magic ou taille invalide → paquet ignoré (log d’erreur).

---

## Référence implémentation

- Encodeur de référence : `tools/faker.js`
- Décodeur : `src/core/protocol.js`
- Receiver : `src/core/stateReceiver.js`
