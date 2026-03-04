import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Listing from "../models/Listing.js";
import { buyShares, getAvailableShares } from "../services/token.service.js";

export const buyInvestmentShares = asyncHandler(async (req, res) => {
  if (req.user.role !== "investor") {
    throw new ApiError(403, "Only investors can buy shares");
  }

  const { listingId, sharesToBuy } = req.body;

  const listing = await Listing.findById(listingId);
  if (!listing) throw new ApiError(404, "Listing not found");

  // In real app: check investor has enough Birr in wallet
  // For now: assume frontend checks → here we just simulate token transfer
  // Later: debit Birr wallet here (cost = sharesToBuy * listing.sharePricePerTokenBirr)

  const result = await buyShares(listingId, req.user._id, sharesToBuy);

  // Mock success message (later: real tx hash)
  return res.json(
    new ApiResponse(
      200,
      {
        ...result,
        costBirr: sharesToBuy * listing.sharePricePerTokenBirr,
        message: "Shares purchased (mock blockchain transfer)",
      },
      "Investment successful",
    ),
  );
});
