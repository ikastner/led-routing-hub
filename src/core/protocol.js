/**
 * Protocole state maison — encode/decode LEDS + DEVS (UDP :6455).
 * Spec : docs/protocole-state.md
 */

const LED_MAGIC = "LEDS";
const DEVS_MAGIC = "DEVS";
const VERSION = 1;
const STATE_PORT = 6455;

const LED_HEADER_SIZE = 13;
const DEVS_HEADER_SIZE = 8;
const LED_ENTRY_SIZE = 3;
const DEVICE_BLOCK_SIZE = 16;
const MAX_LED_ENTRIES_PER_CHUNK = 400;

// Vérifie si le frame candidate est plus récent que le frame current
function isNewerFrame(candidate, current) {
  if (current == null) return true;
  if (candidate === current) return false;
  const diff = (candidate - current + 65536) % 65536;
  return diff > 0 && diff < 32768;
}

// Vérifie si le frame candidate est le même ou plus récent que le frame current
function isSameOrNewerFrame(candidate, current) {
  if (current == null) return true;
  if (candidate === current) return true;
  return isNewerFrame(candidate, current);
}

// Lit la magic string (4 octets) à l'offset donné
function readMagic(buffer, offset = 0) {
  return buffer.toString("ascii", offset, offset + 4);
}

// Encode un chunk de LEDS 
// Retourne un buffer contenant le chunk encodé
function encodeLedsChunk({ frameId, chunkIndex, chunkCount, startEntityId, colors }) {
  const entryCount = colors.length;
  const buf = Buffer.alloc(LED_HEADER_SIZE + entryCount * LED_ENTRY_SIZE); // Alloue un buffer de la taille du header + le nombre d'entrées * la taille d'une entrée

  buf.write(LED_MAGIC, 0, 4, "ascii"); // Écrit la magic string à l'offset 0
  buf.writeUInt8(VERSION, 4); // Écrit la version à l'offset 4
  buf.writeUInt16LE(frameId & 0xffff, 5); // Écrit le frameId à l'offset 5
  buf.writeUInt8(chunkIndex & 0xff, 7); // Écrit le chunkIndex à l'offset 7
  buf.writeUInt8(chunkCount & 0xff, 8); // Écrit le chunkCount à l'offset 8
  buf.writeUInt16LE(startEntityId & 0xffff, 9); // Écrit le startEntityId à l'offset 9
  buf.writeUInt16LE(entryCount & 0xffff, 11); // Écrit le entryCount à l'offset 11

  let offset = LED_HEADER_SIZE; // Définit l'offset à la taille du header
  // Parcourt le tableau de couleurs et écrit chaque composante dans le buffer
  for (const color of colors) {
    buf.writeUInt8(color.r & 0xff, offset); // Écrit la composante rouge à l'offset
    buf.writeUInt8(color.g & 0xff, offset + 1); // Écrit la composante verte à l'offset + 1
    buf.writeUInt8(color.b & 0xff, offset + 2); // Écrit la composante bleue à l'offset + 2
    offset += LED_ENTRY_SIZE; // Incrémente l'offset de la taille d'une entrée
  }

  // Retourne le buffer contenant le chunk encodé exemple : Buffer.from([0x4c, 0x45, 0x44, 0x53, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
  return buf;
}


// Décode un chunk de LEDS
// Retourne les données décodées dans un objet exemple : { frameId: 1, chunkIndex: 0, chunkCount: 1, startEntityId: 0, entryCount: 100, colors: [{ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }] }
function decodeLedsChunk(buffer) {
  if (buffer.length < LED_HEADER_SIZE) { // Vérifie si le buffer est assez grand
    throw new Error(`LEDS trop court (${buffer.length} octets)`); // Lance une erreur si le buffer est trop court
  }
  if (readMagic(buffer) !== LED_MAGIC) { // Vérifie si la magic string est valide
    throw new Error("Magic LEDS invalide"); // Lance une erreur si la magic string est invalide
  }
  if (buffer.readUInt8(4) !== VERSION) { // Vérifie si la version est valide
    throw new Error("Version LEDS non supportée"); // Lance une erreur si la version est invalide
  }

  const frameId = buffer.readUInt16LE(5); // Lit le frameId à l'offset 5
  const chunkIndex = buffer.readUInt8(7); // Lit le chunkIndex à l'offset 7
  const chunkCount = buffer.readUInt8(8); // Lit le chunkCount à l'offset 8
  const startEntityId = buffer.readUInt16LE(9); // Lit le startEntityId à l'offset 9
  const entryCount = buffer.readUInt16LE(11); // Lit le entryCount à l'offset 11

  const expected = LED_HEADER_SIZE + entryCount * LED_ENTRY_SIZE; // Calcule la taille attendue du chunk
  if (buffer.length < expected) { // Vérifie si le buffer est assez grand
    throw new Error(`LEDS incomplet : attendu ${expected}, reçu ${buffer.length}`); // Lance une erreur si le buffer est trop court
  }

  const colors = []; // Initialise un tableau pour les couleurs
  let offset = LED_HEADER_SIZE;
  for (let i = 0; i < entryCount; i += 1) {
    colors.push({
      r: buffer.readUInt8(offset), // Lit la composante rouge à l'offset
      g: buffer.readUInt8(offset + 1), // Lit la composante verte à l'offset + 1
      b: buffer.readUInt8(offset + 2), // Lit la composante bleue à l'offset + 2
    });
    offset += LED_ENTRY_SIZE; // Incrémente l'offset de la taille d'une entrée
  }

  // Retourne les données décodées dans un objet exemple : { frameId: 1, chunkIndex: 0, chunkCount: 1, startEntityId: 0, entryCount: 100, colors: [{ r: 255, g: 0, b: 0 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }] }
  return { frameId, chunkIndex, chunkCount, startEntityId, entryCount, colors };
}


// Encode un chunk de DEVS
// Retourne un buffer contenant le chunk encodé exemple : Buffer.from([0x44, 0x45, 0x56, 0x53, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
function encodeDevsState({ frameId, devices }) {
  const buf = Buffer.alloc(DEVS_HEADER_SIZE + devices.length * DEVICE_BLOCK_SIZE); // Alloue un buffer de la taille du header + le nombre de devices * la taille d'un device

  buf.write(DEVS_MAGIC, 0, 4, "ascii"); // Écrit la magic string à l'offset 0
  buf.writeUInt8(VERSION, 4); // Écrit la version à l'offset 4
  buf.writeUInt16LE(frameId & 0xffff, 5); // Écrit le frameId à l'offset 5
  buf.writeUInt8(devices.length & 0xff, 7); // Écrit le nombre de devices à l'offset 7

  let offset = DEVS_HEADER_SIZE; // Définit l'offset à la taille du header
  // Parcourt le tableau de devices et écrit chaque device dans le buffer
  for (const device of devices) {
    buf.writeUInt8(device.deviceId & 0xff, offset); // Écrit le deviceId à l'offset
    buf.writeUInt8(device.pan ?? 0, offset + 1); // Écrit le pan à l'offset + 1
    buf.writeUInt8(device.panFine ?? 0, offset + 2); // Écrit le panFine à l'offset + 2
    buf.writeUInt8(device.tilt ?? 0, offset + 3); // Écrit le tilt à l'offset + 3
    buf.writeUInt8(device.tiltFine ?? 0, offset + 4); // Écrit le tiltFine à l'offset + 4
    buf.writeUInt8(device.dimmer ?? 0, offset + 5); // Écrit le dimmer à l'offset + 5
    buf.writeUInt8(device.shutter ?? 0, offset + 6); // Écrit le shutter à l'offset + 6
    buf.writeUInt8(device.colorWheel ?? device.colorMacro ?? 0, offset + 7); // Écrit le colorWheel ou colorMacro à l'offset + 7
    buf.writeUInt8(device.r ?? 0, offset + 8); // Écrit la composante rouge à l'offset + 8
    buf.writeUInt8(device.g ?? 0, offset + 9); // Écrit la composante verte à l'offset + 9
    buf.writeUInt8(device.b ?? 0, offset + 10); // Écrit la composante bleue à l'offset + 10    
    buf.writeUInt8(device.w ?? 0, offset + 11); // Écrit la composante blanche à l'offset + 11
    buf.writeUInt8(device.moveSpeed ?? 0, offset + 12); // Écrit la vitesse de déplacement à l'offset + 12
    buf.writeUInt8(device.function ?? 0, offset + 13); // Écrit la fonction à l'offset + 13
    buf.writeUInt16LE(0, offset + 14); // Écrit 0 à l'offset + 14
    offset += DEVICE_BLOCK_SIZE; // Incrémente l'offset de la taille d'un device
  }

  // Retourne le buffer contenant le chunk encodé exemple : Buffer.from([0x44, 0x45, 0x56, 0x53, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
  return buf; 
}

// Décode un chunk de DEVS
// Retourne les données décodées dans un objet exemple : { frameId: 1, deviceCount: 1, devices: [{ deviceId: 1, pan: 0, panFine: 0, tilt: 0, tiltFine: 0, dimmer: 0, shutter: 0, colorWheel: 0, r: 255, g: 0, b: 0, w: 0, moveSpeed: 0, function: 0 }] }
function decodeDevsState(buffer) {
  if (buffer.length < DEVS_HEADER_SIZE) { // Vérifie si le buffer est assez grand
    throw new Error(`DEVS trop court (${buffer.length} octets)`); // Lance une erreur si le buffer est trop court
  }
  if (readMagic(buffer) !== DEVS_MAGIC) { // Vérifie si la magic string est valide
    throw new Error("Magic DEVS invalide"); // Lance une erreur si la magic string est invalide
  }
  if (buffer.readUInt8(4) !== VERSION) { // Vérifie si la version est valide
    throw new Error("Version DEVS non supportée"); // Lance une erreur si la version est invalide
  }

  const frameId = buffer.readUInt16LE(5); // Lit le frameId à l'offset 5
  const deviceCount = buffer.readUInt8(7); // Lit le nombre de devices à l'offset 7

  const expected = DEVS_HEADER_SIZE + deviceCount * DEVICE_BLOCK_SIZE; // Calcule la taille attendue du chunk
  if (buffer.length < expected) { // Vérifie si le buffer est assez grand
    throw new Error(`DEVS incomplet : attendu ${expected}, reçu ${buffer.length}`);
  }

  const devices = []; // Initialise un tableau pour les devices
  let offset = DEVS_HEADER_SIZE;
  for (let i = 0; i < deviceCount; i += 1) {
    devices.push({
      deviceId: buffer.readUInt8(offset), // Lit le deviceId à l'offset
      pan: buffer.readUInt8(offset + 1), // Lit le pan à l'offset + 1
      panFine: buffer.readUInt8(offset + 2), // Lit le panFine à l'offset + 2 
      tilt: buffer.readUInt8(offset + 3), // Lit le tilt à l'offset + 3
      tiltFine: buffer.readUInt8(offset + 4), // Lit le tiltFine à l'offset + 4
      dimmer: buffer.readUInt8(offset + 5), // Lit le dimmer à l'offset + 5
      shutter: buffer.readUInt8(offset + 6), // Lit le shutter à l'offset + 6 
      colorWheel: buffer.readUInt8(offset + 7), // Lit le colorWheel à l'offset + 7
      r: buffer.readUInt8(offset + 8), // Lit la composante rouge à l'offset + 8
      g: buffer.readUInt8(offset + 9), // Lit la composante verte à l'offset + 9
      b: buffer.readUInt8(offset + 10), // Lit la composante bleue à l'offset + 10
      w: buffer.readUInt8(offset + 11), // Lit la composante blanche à l'offset + 11
      moveSpeed: buffer.readUInt8(offset + 12), // Lit la vitesse de déplacement à l'offset + 12
      function: buffer.readUInt8(offset + 13),
    });
    offset += DEVICE_BLOCK_SIZE; // Incrémente l'offset de la taille d'un device
  }

  // Retourne les données décodées dans un objet exemple : { frameId: 1, deviceCount: 1, devices: [{ deviceId: 1, pan: 0, panFine: 0, tilt: 0, tiltFine: 0, dimmer: 0, shutter: 0, colorWheel: 0, r: 255, g: 0, b: 0, w: 0, moveSpeed: 0, function: 0 }] }
  return { frameId, deviceCount, devices };
}

// Récupère les ranges des entités LED
// Retourne un tableau de ranges exemple : [{ start: 0, end: 99 }, { start: 100, end: 199 }]
function getLedEntityRanges(config) {
  const ranges = []; // Initialise un tableau pour les ranges
  // Parcourt le tableau de segments et ajoute les ranges valides au tableau
  for (const seg of config.segments) {
    if (seg.type === "rgb" && seg.entityStart != null && seg.entityEnd != null) { // Vérifie si le segment est valide
      ranges.push({ start: seg.entityStart, end: seg.entityEnd }); // Ajoute le range au tableau
    }
  }
  // Retourne le tableau de ranges exemple : [{ start: 0, end: 99 }, { start: 100, end: 199 }]
  return ranges; 
}


// Chunk un range d'entités LED
// Retourne un tableau de chunks exemple : [{ startEntityId: 0, entryCount: 100 }, { startEntityId: 100, entryCount: 100 }]
function chunkEntityRange(start, end, maxEntries = MAX_LED_ENTRIES_PER_CHUNK) {
  const chunks = []; // Initialise un tableau pour les chunks
  let cursor = start; // Définit le curseur à la valeur de départ
  while (cursor <= end) { // Tant que le curseur est inférieur ou égal à la valeur de fin
    const count = Math.min(maxEntries, end - cursor + 1); // Calcule le nombre d'entités à inclure dans le chunk
    chunks.push({ startEntityId: cursor, entryCount: count }); // Ajoute le chunk au tableau
    cursor += count; // Incrémente le curseur du nombre d'entités à inclure dans le chunk
  }
  // Retourne le tableau de chunks exemple : [{ startEntityId: 0, entryCount: 100 }, { startEntityId: 100, entryCount: 100 }]
  return chunks; 
}

// Récupère tous les chunks des entités LED
// Retourne un tableau de chunks exemple : [{ startEntityId: 0, entryCount: 100 }, { startEntityId: 100, entryCount: 100 }]
function getAllLedChunks(config, maxEntries = MAX_LED_ENTRIES_PER_CHUNK) {
  const chunks = [];
  for (const range of getLedEntityRanges(config)) {
    chunks.push(...chunkEntityRange(range.start, range.end, maxEntries)); // Ajoute les chunks au tableau
  }
  // Retourne le tableau de chunks exemple : [{ startEntityId: 0, entryCount: 100 }, { startEntityId: 100, entryCount: 100 }]
  return chunks; 
}

// Exporte les fonctions du module pour être utilisées dans le reste de l'application
module.exports = {
  LED_MAGIC,
  DEVS_MAGIC,
  VERSION,
  STATE_PORT,
  LED_HEADER_SIZE,
  DEVS_HEADER_SIZE,
  LED_ENTRY_SIZE,
  DEVICE_BLOCK_SIZE,
  MAX_LED_ENTRIES_PER_CHUNK,
  isNewerFrame,
  isSameOrNewerFrame,
  readMagic,
  encodeLedsChunk,
  decodeLedsChunk,
  encodeDevsState,
  decodeDevsState,
  getLedEntityRanges,
  chunkEntityRange,
  getAllLedChunks,
};
