function startWatchdog(bufferManager, receiver, { timeoutMs = 2000, checkEveryMs = 500, graceMs = 5000 } = {}) {
  const startedAt = Date.now();
  let blackoutActive = false;
  let everReceived = false;

  const interval = setInterval(() => {
    const elapsed = Date.now() - receiver.getLastPacketAt();
    const sinceStart = Date.now() - startedAt;

    if (!everReceived && sinceStart < graceMs) return;

    if (receiver.getLastPacketAt() > startedAt) {
      everReceived = true;
    }

    if (elapsed >= timeoutMs) {
      if (!blackoutActive) {
        bufferManager.blackoutAll();
        blackoutActive = true;
        console.warn(`[watchdog] aucun paquet depuis ${(elapsed / 1000).toFixed(1)}s → blackout`);
      }
      return;
    }

    if (blackoutActive) {
      blackoutActive = false;
      console.log("[watchdog] paquets reçus → reprise");
    }
  }, checkEveryMs);

  return {
    stop() {
      clearInterval(interval);
    },
    isBlackoutActive() {
      return blackoutActive;
    },
  };
}

module.exports = {
  startWatchdog,
};
