const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const dgram = require("node:dgram");
const { encodeLedsChunk } = require("../src/core/protocol");
const { startStateReceiver } = require("../src/core/stateReceiver");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendLeds(port, frameId, colors) {
  return new Promise((resolve, reject) => {
    const buf = encodeLedsChunk({
      frameId,
      chunkIndex: 0,
      chunkCount: 1,
      startEntityId: 100,
      colors,
    });
    const sock = dgram.createSocket("udp4");
    sock.send(buf, port, "127.0.0.1", (err) => {
      sock.close();
      if (err) reject(err);
      else resolve();
    });
  });
}

describe("stateReceiver session reset", () => {
  it("accepte un frameId qui repart à 0 après une coupure", async () => {
    const applied = [];
    const bufferManager = {
      setEntityColor(_entityId, r, g, b) {
        applied.push({ r, g, b });
        return true;
      },
      setDevice() {
        return false;
      },
    };

    const receiver = startStateReceiver(bufferManager, {
      port: 0,
      sessionGapMs: 80,
    });
    await receiver.ready;
    const port = receiver.getPort();
    assert.ok(port);

    try {
      await sendLeds(port, 5000, [{ r: 10, g: 0, b: 0 }]);
      await sleep(20);
      assert.equal(applied.at(-1)?.r, 10);
      assert.equal(receiver.getStats().ledFrameId, 5000);

      // Sans gap : frame 0 rejeté comme obsolète
      await sendLeds(port, 0, [{ r: 99, g: 0, b: 0 }]);
      await sleep(20);
      assert.equal(applied.at(-1)?.r, 10);
      assert.equal(receiver.getStats().ledFrameId, 5000);

      // Avec gap : nouvelle session, frame 0 accepté
      await sleep(100);
      await sendLeds(port, 0, [{ r: 200, g: 0, b: 0 }]);
      await sleep(20);
      assert.equal(applied.at(-1)?.r, 200);
      assert.equal(receiver.getStats().ledFrameId, 0);
    } finally {
      receiver.stop();
    }
  });
});
