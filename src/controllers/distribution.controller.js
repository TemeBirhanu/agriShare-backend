import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Listing from "../models/Listing.js";
import User from "../models/User.js";
import {
  getAllHolders,
  closeSharesAfterDistribution,
} from "../services/token.service.js";

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
  if (listing.status !== "active") {
    throw new ApiError(400, "Listing not active");
  }
  // distribution can only be triggered on payday or after
  if (new Date() < listing.paydayDate) {
    throw new ApiError(400, "Payday not reached yet");
  }

  // In real: farmer deposits total revenue Birr to platform first
  // Here: assume he has enough in wallet (later check + debit)

  const investorHolders = await getAllHolders(listingId);
  if (investorHolders.length === 0) {
    throw new ApiError(400, "No investors to distribute to");
  }

  // distribution Option B: use committed EXPECTED yield (no admin verification).
  const investorShareTotalBirr =
    listing.expectedTotalYieldBirr * (listing.sharesToSellPercent / 100);

  let totalDistributed = 0;
  const distributionMap = {};

  for (const holder of investorHolders) {
    const proportion = holder.shares / listing.totalShares; // e.g. 0.15 if 15 shares
    const amount = Math.round(investorShareTotalBirr * proportion);

    // Credit investor in-app wallet
    await User.findByIdAndUpdate(holder.investor._id, {
      $inc: { walletBalance: amount },
    });

    distributionMap[holder.investor._id.toString()] = amount;
    totalDistributed += amount;
  }

  // Debit farmer (he pays the committed amount even if actual < expected)
  await User.findByIdAndUpdate(req.user._id, {
    $inc: { walletBalance: -investorShareTotalBirr },
  });

  // Close listing
  listing.status = "completed";
  await listing.save();

  // Mock burn
  await closeSharesAfterDistribution(listingId, distributionMap);

  // In real: call ERC-20 burn / batch burn

  return res.json(
    new ApiResponse(
      200,
      {
        totalDistributedBirr: investorShareTotalBirr,
        investorCount: investorHolders.length,
        message: "Profits distributed based on expected yield (Option B)",
      },
      "Distribution completed",
    ),
  );
});
