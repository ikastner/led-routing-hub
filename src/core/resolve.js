const { getProjector, getLyres } = require("./config");

function resolveEntity(entityId, segments) {
  for (const seg of segments) {
    if (seg.type === "rgb") {
      const { entityStart, entityEnd } = seg;
      if (entityId >= entityStart && entityId <= entityEnd) {
        const pixelIndex = entityId - entityStart;
        const channel = seg.dmxChannelStart + pixelIndex * seg.channelsPerEntity;
        return {
          entityId,
          name: `LED ${entityId}`,
          type: "rgb",
          controllerIp: seg.controllerIp,
          universe: seg.universe,
          dmxChannel: channel,
          channels: ["r", "g", "b"],
        };
      }
    }

    if (seg.type === "rgbw" && entityId === seg.entityStart) {
      return {
        entityId,
        name: seg.name ?? "Projecteur",
        type: "rgbw",
        controllerIp: seg.controllerIp,
        universe: seg.universe,
        dmxChannel: seg.dmxChannelStart,
        dmxChannelEnd: seg.dmxChannelEnd,
        channels: ["r", "g", "b", "w"],
      };
    }
  }
  return null;
}

function resolveLyre(index, config) {
  const lyres = getLyres(config);
  const lyre = lyres[index - 1];
  if (!lyre) {
    throw new Error(`Lyre ${index} introuvable (1–${lyres.length})`);
  }
  return {
    index,
    name: lyre.name,
    type: "moving_head",
    controllerIp: lyre.controllerIp,
    universe: lyre.universe,
    dmxChannelStart: lyre.dmxChannelStart,
    dmxChannelEnd: lyre.dmxChannelEnd,
    channelsPerEntity: lyre.channelsPerEntity,
  };
}

function resolveProjector(config) {
  const projector = getProjector(config);
  if (!projector) throw new Error("Projecteur introuvable dans la config");
  return resolveEntity(projector.entityStart, config.segments);
}

const QUARTER_HINTS = {
  "192.168.1.45": "quart GAUCHE",
  "192.168.1.46": "centre-gauche",
  "192.168.1.47": "centre-droit",
  "192.168.1.48": "quart DROITE",
};

function formatTarget(target) {
  const quarter = QUARTER_HINTS[target.controllerIp] ?? "";
  if (target.type === "moving_head") {
    return `${target.name} → ${target.controllerIp} (${quarter}) univers ${target.universe} canaux ${target.dmxChannelStart}–${target.dmxChannelEnd}`;
  }
  const ch =
    target.dmxChannelEnd != null
      ? `canaux ${target.dmxChannel}–${target.dmxChannelEnd}`
      : `canal ${target.dmxChannel}`;
  return `${target.name ?? "entité " + target.entityId} → ${target.controllerIp} (${quarter}) univers ${target.universe} ${ch}`;
}

module.exports = {
  resolveEntity,
  resolveLyre,
  resolveProjector,
  formatTarget,
  QUARTER_HINTS,
};
