/**
 * API HTTP config pour les apps d’authoring (Studio / Unity).
 * Port défaut 6456 — distinct de l’UDP state :6455.
 */

const http = require("http");
const { loadConfig } = require("./config");
const { murLedToWallBands } = require("./wallBands");
const { CONFIG_API_PORT } = require("./paths");

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

function createConfigServer(getContext = () => ({})) {
  let server = null;
  let port = CONFIG_API_PORT;

  function handler(req, res) {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const ctx = getContext();

    try {
      if (url.pathname === "/api/health") {
        sendJson(res, 200, {
          ok: true,
          version: 1,
          running: Boolean(ctx.running),
          configApiPort: port,
          statePort: ctx.statePort ?? 6455,
        });
        return;
      }

      if (url.pathname === "/api/active-profile") {
        sendJson(res, 200, {
          id: ctx.profileId ?? "default",
          label: ctx.profileLabel ?? "default",
        });
        return;
      }

      if (url.pathname === "/api/wall-bands") {
        const config = typeof ctx.getConfig === "function" ? ctx.getConfig() : loadConfig();
        const wallBands = murLedToWallBands(config, {
          profile: ctx.profileId ?? "default",
          generatedFrom: config.generatedFrom ?? "config/mur-led.json",
        });
        sendJson(res, 200, wallBands);
        return;
      }

      if (url.pathname === "/api/mur-led") {
        const config = typeof ctx.getConfig === "function" ? ctx.getConfig() : loadConfig();
        sendJson(res, 200, config);
        return;
      }

      sendJson(res, 404, { error: "Not found", path: url.pathname });
    } catch (err) {
      sendJson(res, 500, { error: err.message ?? String(err) });
    }
  }

  return {
    async start(options = {}) {
      if (server) return { port };
      port = options.port ?? CONFIG_API_PORT;

      server = http.createServer(handler);
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "0.0.0.0", () => {
          server.off("error", reject);
          const addr = server.address();
          if (addr && typeof addr === "object") port = addr.port;
          resolve();
        });
      });

      console.log(`[config-api] http://127.0.0.1:${port}/api/wall-bands`);
      return { port };
    },

    stop() {
      if (!server) return;
      server.close();
      server = null;
    },

    getPort() {
      return port;
    },

    isListening() {
      return server != null;
    },
  };
}

module.exports = {
  createConfigServer,
  CONFIG_API_PORT,
};
