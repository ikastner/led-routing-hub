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
const SHUTTER_OPEN = 40;
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

module.exports = {
  CHANNELS,
  CHANNEL_COUNT,
  DANGEROUS_OFFSETS,
  COLOR_WHEEL_PRESETS,
  DIMMER_FULL,
  SHUTTER_OPEN,
  CENTER,
};
