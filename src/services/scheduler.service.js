import { processExpiredListingRefunds } from "./refund.service.js";
import Listing from "../models/Listing.js";
import InvestmentContract from "../models/InvestmentContract.js";
import ShareOwnership from "../models/ShareOwnership.js";
import {
  createNotificationSafe,
  notifyRoleSafe,
  notifyUserIdsSafe,
} from "./notification.service.js";

let schedulerTimer = null;
let schedulerRunning = false;

const LISTING_PAYMENT_GRACE_PERIOD_DAYS = Number(
  process.env.LISTING_PAYMENT_GRACE_PERIOD_DAYS || 3,
);

const getListingPaymentDeadline = (listing) =>
  listing.effectivePaydayDate || listing.paydayDate || null;

const getActiveInvestorIds = async (listingId) => {
  const holders = await ShareOwnership.find({
    listing: listingId,
    status: "active",
    shares: { $gt: 0 },
  })
    .populate("investor", "_id firstName lastName email")
    .lean();

  return holders
    .map((holder) => holder.investor?._id)
    .filter(Boolean)
    .map(String);
};

const notifyListingPaymentDue = async (listing, investorIds, dueDate) => {
  const listingTitle = listing.pitchTitle || "investment listing";

  await createNotificationSafe({
    recipient: listing.farmer,
    type: "listing_payment_due",
    title: "Listing Payment Is Due",
    message: `Your listing "${listingTitle}" has reached payday. Please distribute investor returns within ${LISTING_PAYMENT_GRACE_PERIOD_DAYS} days.`,
    referenceId: listing._id,
    referenceModel: "Listing",
    meta: {
      status: "payment_due",
      dueDate,
      gracePeriodDays: LISTING_PAYMENT_GRACE_PERIOD_DAYS,
    },
  });

  if (investorIds.length > 0) {
    await notifyUserIdsSafe(investorIds, {
      type: "listing_payment_due",
      title: "Listing Payout Pending",
      message: `Listing "${listingTitle}" has reached payday. The farmer has ${LISTING_PAYMENT_GRACE_PERIOD_DAYS} days to distribute returns before the contract becomes disputed.`,
      referenceId: listing._id,
      referenceModel: "Listing",
      meta: {
        status: "payment_due",
        dueDate,
        gracePeriodDays: LISTING_PAYMENT_GRACE_PERIOD_DAYS,
      },
    });
  }

  await notifyRoleSafe("admin", {
    type: "listing_payment_due",
    title: "Listing Payment Due",
    message: `Listing "${listingTitle}" has passed payday and is in the grace period.`,
    referenceId: listing._id,
    referenceModel: "Listing",
    meta: {
      status: "payment_due",
      dueDate,
      gracePeriodDays: LISTING_PAYMENT_GRACE_PERIOD_DAYS,
    },
  });
};

const notifyListingDisputed = async (listing, investorIds, dueDate) => {
  const listingTitle = listing.pitchTitle || "investment listing";

  await createNotificationSafe({
    recipient: listing.farmer,
    type: "listing_disputed",
    title: "Listing Marked Disputed",
    message: `Your listing "${listingTitle}" was not distributed within the grace period and is now disputed.`,
    referenceId: listing._id,
    referenceModel: "Listing",
    meta: {
      status: "disputed",
      dueDate,
      gracePeriodDays: LISTING_PAYMENT_GRACE_PERIOD_DAYS,
    },
  });

  if (investorIds.length > 0) {
    await notifyUserIdsSafe(investorIds, {
      type: "listing_disputed",
      title: "Listing Contract Disputed",
      message: `Listing "${listingTitle}" is now disputed because the farmer did not distribute returns within the grace period.`,
      referenceId: listing._id,
      referenceModel: "Listing",
      meta: {
        status: "disputed",
        dueDate,
        gracePeriodDays: LISTING_PAYMENT_GRACE_PERIOD_DAYS,
      },
    });
  }

  await notifyRoleSafe("admin", {
    type: "listing_disputed",
    title: "Listing Disputed After Grace Period",
    message: `Listing "${listingTitle}" moved to disputed after the payment grace period expired.`,
    referenceId: listing._id,
    referenceModel: "Listing",
    meta: {
      status: "disputed",
      dueDate,
      gracePeriodDays: LISTING_PAYMENT_GRACE_PERIOD_DAYS,
    },
  });
};

const processOverdueListingPayments = async () => {
  const now = new Date();
  const dueListings = await Listing.find({
    status: "funded",
    $or: [
      { effectivePaydayDate: { $lte: now } },
      { paydayDate: { $lte: now } },
    ],
  }).select(
    "_id farmer pitchTitle status paydayDate effectivePaydayDate paymentDueAt gracePeriodEndsAt paymentDueNotifiedAt disputedAt disputeReason",
  );

  const paymentDueResults = [];
  for (const listing of dueListings) {
    const dueDate = getListingPaymentDeadline(listing);
    if (!dueDate) {
      continue;
    }

    const activeInvestorIds = await getActiveInvestorIds(listing._id);

    listing.status = "payment_due";
    listing.paymentDueAt = now;
    listing.gracePeriodEndsAt = new Date(
      now.getTime() + LISTING_PAYMENT_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    );
    listing.paymentDueNotifiedAt = now;
    listing.disputedAt = null;
    listing.disputeReason = null;
    await listing.save();

    await notifyListingPaymentDue(listing, activeInvestorIds, dueDate);

    paymentDueResults.push({
      listingId: String(listing._id),
      status: "payment_due",
      gracePeriodEndsAt: listing.gracePeriodEndsAt,
      investorCount: activeInvestorIds.length,
    });
  }

  const disputedListings = await Listing.find({
    status: "payment_due",
    gracePeriodEndsAt: { $lte: now },
  }).select(
    "_id farmer pitchTitle status paydayDate effectivePaydayDate paymentDueAt gracePeriodEndsAt paymentDueNotifiedAt disputedAt disputeReason",
  );

  const disputedResults = [];
  for (const listing of disputedListings) {
    const dueDate = getListingPaymentDeadline(listing);
    const activeInvestorIds = await getActiveInvestorIds(listing._id);
    const disputeReason = "payment_not_distributed_within_grace_period";

    await InvestmentContract.updateMany(
      { listing: listing._id, status: "active" },
      {
        $set: {
          status: "disputed",
          disputedAt: now,
          disputeReason,
        },
      },
    );

    listing.status = "disputed";
    listing.disputedAt = now;
    listing.disputeReason = disputeReason;
    await listing.save();

    await notifyListingDisputed(listing, activeInvestorIds, dueDate);

    disputedResults.push({
      listingId: String(listing._id),
      status: "disputed",
      investorCount: activeInvestorIds.length,
    });
  }

  return {
    paymentDue: paymentDueResults.length,
    disputed: disputedResults.length,
    paymentDueResults,
    disputedResults,
  };
};

const runSchedulerTick = async () => {
  if (schedulerRunning) {
    return;
  }

  schedulerRunning = true;
  try {
    try {
      const deadlineResult = await processOverdueListingPayments();
      if (deadlineResult.paymentDue > 0 || deadlineResult.disputed > 0) {
        console.log(
          `[FundingScheduler] Payment due: ${deadlineResult.paymentDue}, disputed: ${deadlineResult.disputed}`,
        );
      }
    } catch (error) {
      console.error(
        "[FundingScheduler] Error while processing payout deadlines",
        error,
      );
    }

    try {
      const refundResult = await processExpiredListingRefunds();
      if (refundResult.refunded > 0) {
        console.log(
          `[FundingScheduler] Refunded ${refundResult.refunded} expired listing(s) out of ${refundResult.scanned} scanned`,
        );
      }
    } catch (error) {
      console.error(
        "[FundingScheduler] Error while processing expired listing refunds",
        error,
      );
    }
  } catch (error) {
    console.error(
      "[FundingScheduler] Error while processing funding lifecycle jobs",
      error,
    );
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
