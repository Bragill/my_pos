const cron = require("node-cron");
const batchService = require("../services/batchService");

/**
 * Schedules a daily job (00:05 Asia/Bangkok) that scans production batches for
 * expired finished goods and automatically removes their remaining stock.
 * Also runs once immediately on startup to cover any downtime while the server was off.
 */
function start() {
  batchService.runExpiryCheck().catch((err) => {
    console.error("[expiryCheckJob] initial run failed:", err.message);
  });

  cron.schedule(
    "5 0 * * *",
    () => {
      batchService.runExpiryCheck().catch((err) => {
        console.error("[expiryCheckJob] scheduled run failed:", err.message);
      });
    },
    { timezone: "Asia/Bangkok" }
  );

  console.log("[expiryCheckJob] Scheduled daily expiry check at 00:05 (Asia/Bangkok).");
}

module.exports = { start };
