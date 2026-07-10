const dgram = require("dgram");

const ARTNET_PORT = 6454;
const MAX_DMX_CHANNELS = 512;

function buildArtDmx(universe, dmxData, sequence = 0) {
  let data = Buffer.from(dmxData);
  if (data.length > MAX_DMX_CHANNELS) {
    throw new Error(`Payload DMX trop long (${data.length} > ${MAX_DMX_CHANNELS})`);
  }
  if (data.length % 2 === 1) {
    data = Buffer.concat([data, Buffer.from([0])]);
  }
  if (data.length < 2) {
    data = Buffer.alloc(2, 0);
  }

  const net = (universe >> 8) & 0x7f;
  const subUni = universe & 0xff;
  const header = Buffer.alloc(18);

  header.write("Art-Net\0", 0, 8, "ascii");
  header.writeUInt16LE(0x5000, 8);
  header.writeUInt16LE(14, 10);
  header.writeUInt8(sequence & 0xff, 12);
  header.writeUInt8(0, 13);
  header.writeUInt8(subUni, 14);
  header.writeUInt8(net, 15);
  header.writeUInt16BE(data.length, 16);

  return Buffer.concat([header, data]);
}

function emptyPayload() {
  return Buffer.alloc(MAX_DMX_CHANNELS, 0);
}

function setChannel(payload, channel, value) {
  if (channel < 1 || channel > MAX_DMX_CHANNELS) {
    throw new Error(`Canal DMX invalide : ${channel}`);
  }
  payload[channel - 1] = value & 0xff;
}

function setRgb(payload, channelStart, r, g, b) {
  setChannel(payload, channelStart, r);
  setChannel(payload, channelStart + 1, g);
  setChannel(payload, channelStart + 2, b);
}

function setRgbw(payload, channelStart, r, g, b, w) {
  setRgb(payload, channelStart, r, g, b);
  setChannel(payload, channelStart + 3, w);
}

function parseColor(value, components = 3) {
  const parts = value.split(",").map((p) => Math.max(0, Math.min(255, parseInt(p.trim(), 10))));
  if (parts.length !== components || parts.some((n) => Number.isNaN(n))) {
    throw new Error(
      components === 4
        ? "Couleur attendue : R,G,B,W (ex. 255,0,0,0)"
        : "Couleur attendue : R,G,B (ex. 255,0,0)"
    );
  }
  return parts;
}

function sendArtDmx(ip, universe, payload, { repeat = 10, hz = 10, dryRun = false, quiet = false } = {}) {
  if (!quiet) {
    console.log(`Paquet ArtDmx → ${ip}:${ARTNET_PORT} univers ${universe}`);
  }

  if (dryRun) {
    if (!quiet) console.log("(dry-run, aucun envoi réseau)");
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket("udp4");
    const interval = hz > 0 ? 1000 / hz : 0;
    let frame = 0;

    const sendFrame = () => {
      const seq = (frame % 255) + 1;
      const pkt = buildArtDmx(universe, payload, seq);
      sock.send(pkt, ARTNET_PORT, ip, (err) => {
        if (err) {
          sock.close();
          reject(err);
          return;
        }
        frame += 1;
        if (frame >= repeat) {
          sock.close();
          resolve();
          return;
        }
        if (interval > 0) setTimeout(sendFrame, interval);
        else sendFrame();
      });
    };

    sendFrame();
  });
}

module.exports = {
  ARTNET_PORT,
  MAX_DMX_CHANNELS,
  buildArtDmx,
  emptyPayload,
  setChannel,
  setRgb,
  setRgbw,
  parseColor,
  sendArtDmx,
};
