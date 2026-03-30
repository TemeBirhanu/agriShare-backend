import mongoose from "mongoose";
import InvestmentContract from "../models/InvestmentContract.js";
import Listing from "../models/Listing.js";
import ShareOwnership from "../models/ShareOwnership.js";
import User from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";

const roundBirr = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const isTransactionNotSupportedError = (error) =>
  error?.code === 20 ||
  error?.codeName === "IllegalOperation" ||
  String(error?.message || "").includes(
    "Transaction numbers are only allowed on a replica set member or mongos",
  );

const withSession = (session) => (session ? { session } : {});

export const refundListingInvestments = async (
  listingId,
  { force = false, reason = "funding_goal_not_met_before_deadline" } = {},
) => {
  const runRefund = async (session = null) => {
    let result = {
      refunded: false,
      listingId,
      refundedContractCount: 0,
      refundedAmountBirr: 0,
      investorCount: 0,
      reason: "not_eligible",
    };

    const listingQuery = Listing.findById(listingId);
    const listing = session
      ? await listingQuery.session(session)
      : await listingQuery;
    if (!listing) {
      throw new ApiError(404, "Listing not found for refund");
    }

    const deadlinePassed =
      listing.investmentDeadline &&
      new Date() > new Date(listing.investmentDeadline);
    const goalMet =
      Number(listing.totalInvestedBirr || 0) >=
      Number(listing.investmentGoalBirr || 0);

    const eligibleByRule =
      listing.status === "active" && deadlinePassed && !goalMet;

    if (!force && !eligibleByRule) {
      result = {
        ...result,
        listingId: String(listing._id),
        reason: "listing_not_eligible_for_refund",
      };
      return;
    }

    if (listing.status === "refunded") {
      result = {
        ...result,
        listingId: String(listing._id),
        reason: "already_refunded",
      };
      return result;
    }

    const contractsQuery = InvestmentContract.find({
      listing: listing._id,
      status: { $in: ["active", "disputed"] },
    });
    const contracts = session
      ? await contractsQuery.session(session)
      : await contractsQuery;

    const refundByInvestor = new Map();
    for (const contract of contracts) {
      const investorId = String(contract.investor);
      const current = refundByInvestor.get(investorId) || 0;
      refundByInvestor.set(
        investorId,
        roundBirr(current + Number(contract.amountPaidBirr || 0)),
      );
    }

    const totalRefundedBirr = Array.from(refundByInvestor.values()).reduce(
      (sum, amount) => roundBirr(sum + amount),
      0,
    );

    if (totalRefundedBirr > 0) {
      const farmerQuery = User.findById(listing.farmer);
      const farmer = session
        ? await farmerQuery.session(session)
        : await farmerQuery;
      if (!farmer) {
        throw new ApiError(404, "Farmer account not found for refund");
      }

      if (Number(farmer.fundWalletBalance || 0) < totalRefundedBirr) {
        throw new ApiError(
          409,
          "Farmer fund wallet balance is insufficient for refund settlement",
        );
      }

      const userWalletOps = Array.from(refundByInvestor.entries()).map(
        ([investorId, amount]) => ({
          updateOne: {
            filter: { _id: investorId },
            update: { $inc: { walletBalance: amount } },
          },
        }),
      );

      if (userWalletOps.length > 0) {
        await User.bulkWrite(userWalletOps, withSession(session));
      }

      await User.findByIdAndUpdate(
        listing.farmer,
        { $inc: { fundWalletBalance: -totalRefundedBirr } },
        withSession(session),
      );
    }

    await InvestmentContract.updateMany(
      { listing: listing._id, status: { $in: ["active", "disputed"] } },
      { $set: { status: "refunded", refundedAt: new Date() } },
      withSession(session),
    );

    await ShareOwnership.updateMany(
      { listing: listing._id, status: "active" },
      {
        $set: {
          status: "refunded",
          shares: 0,
          refundedAt: new Date(),
        },
      },
      withSession(session),
    );

    listing.status = "refunded";
    listing.refundedAt = new Date();
    listing.refundReason = reason;
    await listing.save(withSession(session));

    result = {
      refunded: true,
      listingId: String(listing._id),
      refundedContractCount: contracts.length,
      refundedAmountBirr: totalRefundedBirr,
      investorCount: refundByInvestor.size,
      reason,
    };
    return result;
  };

  const session = await mongoose.startSession();

  try {
    try {
      let result = null;
      await session.withTransaction(async () => {
        result = await runRefund(session);
      });
      return result;
    } catch (error) {
      if (!isTransactionNotSupportedError(error)) {
        throw error;
      }

      return runRefund(null);
    }
  } finally {
    await session.endSession();
  }
};

export const processExpiredListingRefunds = async () => {
  const now = new Date();

  const expiredListings = await Listing.find({
    status: "active",
    investmentDeadline: { $lt: now },
    $expr: { $lt: ["$totalInvestedBirr", "$investmentGoalBirr"] },
  })
    .select("_id")
    .lean();

  const results = [];
  for (const listing of expiredListings) {
    const refundResult = await refundListingInvestments(listing._id, {
      force: true,
      reason: "automatic_deadline_refund",
    });
    results.push(refundResult);
  }

  return {
    scanned: expiredListings.length,
    refunded: results.filter((item) => item.refunded).length,
    results,
  };
};
