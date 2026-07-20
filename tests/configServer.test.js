const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { loadConfig } = require("../src/core/config");
const { createConfigServer } = require("../src/core/configServer");

function getJson(port, pathname) {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}${pathname}`, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode, body: JSON.parse(body || "{}") });
        });
      })
      .on("error", reject);
  });
}

describe("configServer", () => {
  const config = loadConfig();
  let server;
  let port;

  before(async () => {
    server = createConfigServer(() => ({
      running: true,
      statePort: 6455,
      profileId: "default",
      profileLabel: "default",
      getConfig: () => config,
    }));
    // Port éphémère pour les tests
    const started = await server.start({ port: 0 });
    port = server.getPort();
    assert.ok(port > 0);
    assert.equal(started.port, port);
  });

  after(() => {
    server.stop();
  });

  it("GET /api/health", async () => {
    const { status, body } = await getJson(port, "/api/health");
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.running, true);
  });

  it("GET /api/active-profile", async () => {
    const { status, body } = await getJson(port, "/api/active-profile");
    assert.equal(status, 200);
    assert.equal(body.id, "default");
  });

  it("GET /api/wall-bands", async () => {
    const { status, body } = await getJson(port, "/api/wall-bands");
    assert.equal(status, 200);
    assert.equal(body.columns, 128);
    assert.equal(body.bands.length, 128);
    assert.equal(body.bands[0].entityStart, 100);
    assert.equal(body.profile, "default");
  });
});
