import { processExpiredListingRefunds } from "./refund.service.js";

let schedulerTimer = null;
let schedulerRunning = false;

const runSchedulerTick = async () => {
  if (schedulerRunning) {
    return;
  }

  schedulerRunning = true;
  try {
    const result = await processExpiredListingRefunds();
    if (result.refunded > 0) {
      console.log(
        `[FundingScheduler] Refunded ${result.refunded} expired listing(s) out of ${result.scanned} scanned`,
      );
    }
  } catch (error) {
    console.error("[FundingScheduler] Error while processing refunds", error);
  } finally {
    schedulerRunning = false;
  }
};

export const startFundingLifecycleScheduler = () => {
  if (schedulerTimer) {
    return;
  }

  const intervalMs = Number(process.env.FUNDING_SCHEDULER_INTERVAL_MS || 60000);

  schedulerTimer = setInterval(() => {
    runSchedulerTick().catch(() => null);
  }, intervalMs);

  // Run one quick sweep shortly after startup.
  setTimeout(() => {
    runSchedulerTick().catch(() => null);
  }, 5000);

  console.log(`[FundingScheduler] Started with interval ${intervalMs}ms`);
};

export const stopFundingLifecycleScheduler = () => {
  if (!schedulerTimer) {
    return;
  }

  clearInterval(schedulerTimer);
  schedulerTimer = null;
  console.log("[FundingScheduler] Stopped");
};
