const { setChannel } = require("./artnet");

const CHANNELS = {
  pan: 0,
  panFine: 1,
  tilt: 2,
  tiltFine: 3,
  dimmer: 4,
  shutter: 5,
  colorWheel: 6,
  r: 7,
  g: 8,
  b: 9,
  aux1: 10,
  aux2: 11,
  aux3: 12,
  aux4: 13,
};

const CHANNEL_COUNT = 14;
const DIMMER_FULL = 255;
/** Valeur authoring « shutter ouvert » (Unity / faker). Sur beaucoup de lyres, 40 = strobe. */
const SHUTTER_OPEN = 40;
/** Valeur DMX « open / no strobe » envoyée au fixture. */
const SHUTTER_DMX_OPEN = 255;
const CENTER = 128;

const DANGEROUS_OFFSETS = new Set([
  CHANNELS.g,
  CHANNELS.b,
  CHANNELS.aux1,
  CHANNELS.aux2,
  CHANNELS.aux3,
  CHANNELS.aux4,
]);

const COLOR_WHEEL_PRESETS = {
  open: 0,
  white: 40,
  warm: 60,
  red: 80,
  green: 120,
  blue: 160,
};

/**
 * Mappe le shutter authoring → DMX fixture.
 * Beaucoup de lyres : 0 = fermé, 1–127 ≈ strobe, 128–255 = open.
 * Authoring envoie 40 pour « ouvert » → on force 255.
 */
function mapAuthoringShutterToDmx(shutter) {
  const s = (shutter ?? 0) & 0xff;
  if (s === 0) return 0;
  // Zone « open authoring » / bas (évite le strobe hardware)
  if (s > 0 && s <= 127) return SHUTTER_DMX_OPEN;
  return s;
}

module.exports = {
  CHANNELS,
  CHANNEL_COUNT,
  DANGEROUS_OFFSETS,
  COLOR_WHEEL_PRESETS,
  DIMMER_FULL,
  SHUTTER_OPEN,
  SHUTTER_DMX_OPEN,
  CENTER,
  mapAuthoringShutterToDmx,
};
