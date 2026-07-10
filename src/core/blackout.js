const { emptyPayload, sendArtDmx } = require("./artnet");
const { getProjector, getLyres } = require("./config");

function listUniverses(config) {
  const targets = [];
  for (const controller of config.controllers) {
    for (let universe = controller.universeMin; universe <= controller.universeMax; universe += 1) {
      targets.push({
        ip: controller.ip,
        universe,
        label: controller.label,
      });
    }
  }
  return targets;
}

async function blackoutAll(config, { repeat = 5, hz = 40, dryRun = false } = {}) {
  const payload = emptyPayload();
  const targets = listUniverses(config);

  console.log(`Blackout : ${targets.length} univers sur ${config.controllers.length} BC216`);

  if (dryRun) {
    for (const target of targets) {
      console.log(`  → ${target.ip} univers ${target.universe}`);
    }
    return;
  }

  await Promise.all(
    targets.map((target) =>
      sendArtDmx(target.ip, target.universe, payload, { repeat, hz, quiet: true })
    )
  );

  console.log(`Tout éteint — ${repeat} paquet(s) × ${targets.length} univers`);
}

async function shutdownDevices(config, { repeat = 5, hz = 40, dryRun = false } = {}) {
  const projector = getProjector(config);
  if (!projector) throw new Error("Projecteur introuvable");

  const lyres = getLyres(config);
  const payload = emptyPayload();

  console.log(`Shutdown panneau : projecteur + ${lyres.length} lyre(s) → ${projector.controllerIp} univers ${projector.universe}`);

  if (dryRun) return;

  await sendArtDmx(projector.controllerIp, projector.universe, payload, { repeat, hz });
}

module.exports = {
  listUniverses,
  blackoutAll,
  shutdownDevices,
};
