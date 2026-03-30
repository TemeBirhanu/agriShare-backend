import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Listing from "../models/Listing.js";
import InvestmentContract from "../models/InvestmentContract.js";
import User from "../models/User.js";
import { refundListingInvestments } from "../services/refund.service.js";
import {
  getAllHolders,
  closeSharesAfterDistribution,
} from "../services/token.service.js";

const roundBirr = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const distributeProfits = asyncHandler(async (req, res) => {
  if (req.user.role !== "farmer") {
    throw new ApiError(403, "Only farmers can trigger distribution");
  }

  const { listingId } = req.body;

  const listing = await Listing.findById(listingId).populate("asset");
  if (!listing) throw new ApiError(404, "Listing not found");
  if (listing.farmer.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Not your listing");
  }
  if (!["funded", "active"].includes(listing.status)) {
    throw new ApiError(400, "Listing is not ready for distribution");
  }

  if (
    Number(listing.totalInvestedBirr || 0) <
    Number(listing.investmentGoalBirr || 0)
  ) {
    throw new ApiError(400, "Funding goal has not been reached yet");
  }

  // In real: farmer deposits total revenue Birr to platform first
  // Here: assume he has enough in wallet (later check + debit)

  const investorHolders = await getAllHolders(listingId);
  if (investorHolders.length === 0) {
    throw new ApiError(400, "No investors to distribute to");
  }

  const eligibleHolders = investorHolders.filter(
    (holder) => holder.status === "active" && Number(holder.shares || 0) > 0,
  );

  if (eligibleHolders.length === 0) {
    throw new ApiError(400, "No active investor shares found for distribution");
  }

  // distribution Option B: use committed EXPECTED yield (no admin verification).
  const investorShareTotalBirr = roundBirr(
    Number(listing.expectedTotalYieldBirr || 0) *
      (Number(listing.sharesToSellPercent || 0) / 100),
  );

  const totalInvestorShares = eligibleHolders.reduce(
    (sum, holder) => sum + Number(holder.shares || 0),
    0,
  );

  if (totalInvestorShares <= 0) {
    throw new ApiError(400, "Invalid investor share totals for distribution");
  }

  let totalDistributed = 0;
  const distributionMap = {};
  const distributions = [];
  let assignedBeforeLast = 0;

  for (let index = 0; index < eligibleHolders.length; index += 1) {
    const holder = eligibleHolders[index];
    const holderShares = Number(holder.shares || 0);
    const isLastHolder = index === eligibleHolders.length - 1;

    const amount = isLastHolder
      ? roundBirr(investorShareTotalBirr - assignedBeforeLast)
      : roundBirr(
          (investorShareTotalBirr * holderShares) / totalInvestorShares,
        );

    if (!isLastHolder) {
      assignedBeforeLast = roundBirr(assignedBeforeLast + amount);
    }

    // Credit investor in-app wallet
    await User.findByIdAndUpdate(holder.investor._id, {
      $inc: { walletBalance: amount },
    });

    distributionMap[holder.investor._id.toString()] = amount;
    totalDistributed = roundBirr(totalDistributed + amount);

    distributions.push({
      investorId: holder.investor._id,
      shares: holderShares,
      amountBirr: amount,
    });
  }

  // Debit farmer (he pays the committed amount even if actual < expected)
  await User.findByIdAndUpdate(req.user._id, {
    $inc: { walletBalance: -totalDistributed },
  });

  // Close listing
  listing.status = "completed";
  await listing.save();

  await InvestmentContract.updateMany(
    { listing: listing._id, status: "active" },
    { $set: { status: "completed" } },
  );

  // Mock burn
  await closeSharesAfterDistribution(listingId, distributionMap);

  // In real: call ERC-20 burn / batch burn

  return res.json(
    new ApiResponse(
      200,
      {
        totalDistributedBirr: totalDistributed,
        investorCount: eligibleHolders.length,
        totalInvestorShares,
        investorShareTotalBirr,
        distributions,
        message:
          "Profits distributed based on expected yield and active investor share ratio",
      },
      "Distribution completed",
    ),
  );
});

export const triggerManualListingRefund = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    throw new ApiError(403, "Only admins can trigger manual refunds");
  }

  const { listingId, force = false, reason } = req.body;

  if (!listingId) {
    throw new ApiError(400, "listingId is required");
  }

  const normalizedReason =
    typeof reason === "string" && reason.trim()
      ? reason.trim()
      : "manual_admin_refund";

  const result = await refundListingInvestments(listingId, {
    force: Boolean(force),
    reason: normalizedReason,
  });

  if (!result.refunded) {
    throw new ApiError(
      400,
      `Refund not processed: ${
        result.reason || "listing_not_eligible_for_refund"
      }`,
    );
  }

  return res.json(
    new ApiResponse(
      200,
      { refund: result },
      "Manual refund processed successfully",
    ),
  );
});
