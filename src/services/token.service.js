import ShareOwnership from "../models/ShareOwnership.js";
import Listing from "../models/Listing.js";
import { ApiError } from "../utils/ApiError.js";

// Mock total supply (latter future ERC-20)
const TOTAL_SUPPLY = 100;

// Get current available shares for sale (not yet bought)
async function getAvailableShares(listingId) {
  const bought = await ShareOwnership.aggregate([
    { $match: { listing: listingId } },
    { $group: { _id: null, total: { $sum: "$shares" } } },
  ]);

  const totalBought = bought[0]?.total || 0;
  return TOTAL_SUPPLY - totalBought;
}

// Buy shares (mock transfer)
async function buyShares(listingId, investorId, sharesToBuy) {
  if (sharesToBuy < 1) throw new ApiError(400, "Minimum 1 share");

  const listing = await Listing.findById(listingId);
  if (!listing || listing.status !== "active") {
    throw new ApiError(400, "Listing not active");
  }

  const available = await getAvailableShares(listingId);
  if (sharesToBuy > available) {
    throw new ApiError(400, `Only ${available} shares available`);
  }

  if (sharesToBuy < listing.minSharesPerInvestor) {
    throw new ApiError(
      400,
      `Minimum ${listing.minSharesPerInvestor} shares required`,
    );
  }

  // Upsert investor balance
  await ShareOwnership.findOneAndUpdate(
    { listing: listingId, investor: investorId },
    { $inc: { shares: sharesToBuy }, purchasedAt: new Date() },
    { upsert: true, new: true },
  );

  return {
    success: true,
    sharesBought: sharesToBuy,
    remaining: available - sharesToBuy,
  };
}

// Get investor balance for a listing
async function getInvestorShares(listingId, investorId) {
  const record = await ShareOwnership.findOne({
    listing: listingId,
    investor: investorId,
  });
  return record ? record.shares : 0;
}

// Get all holders + balances (for distribution)
async function getAllHolders(listingId) {
  return ShareOwnership.find({ listing: listingId }).populate(
    "investor",
    "fullName email",
  );
}

// Burn all shares after distribution (mock close)
async function closeSharesAfterDistribution(listingId, distributionMap) {
  const updates = Object.entries(distributionMap).map(
    ([investorId, amount]) => ({
      updateOne: {
        filter: { listing: listingId, investor: investorId },
        update: {
          $set: {
            status: "completed",
            distributedAmountBirr: amount,
          },
        },
      },
    }),
  );

  if (updates.length > 0) {
    await ShareOwnership.bulkWrite(updates);
  }

  // In real blockchain later: burn or lock tokens here
}

// For future real blockchain: just replace these functions with ethers calls
// e.g. contract.balanceOf(), contract.transfer(), contract.burn()

export {
  TOTAL_SUPPLY,
  getAvailableShares,
  buyShares,
  getInvestorShares,
  getAllHolders,
  closeSharesAfterDistribution,
};
