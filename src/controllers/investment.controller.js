import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Listing from "../models/Listing.js";
import { buyShares, getAvailableShares } from "../services/token.service.js";
import InvestmentContract from "../models/InvestmentContract.js";
import ShareOwnership from "../models/ShareOwnership.js";

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

  const contract = await InvestmentContract.create({
    listing: listing._id,
    investor: req.user._id,
    farmer: listing.farmer,
    sharesPurchased: sharesToBuy,
    amountPaidBirr: sharesToBuy * listing.sharePricePerTokenBirr,
    // pdfUrl: await generatePdf(...)  ← later
  });

  // Return in response
  return res.json(
    new ApiResponse(
      200,
      {
        ...result,
        costBirr: sharesToBuy * listing.sharePricePerTokenBirr,
        contractNumber: contract.contractNumber,
        contractId: contract._id,
        message: "Shares purchased & investment contract created",
      },
      "Investment successful",
    ),
  );
});

// My active investments (investor only)
export const getMyActiveInvestments = asyncHandler(async (req, res) => {
  const investments = await ShareOwnership.find({
    investor: req.user._id,
    status: "active",
  })
    .populate({
      path: "listing",
      select:
        "investmentGoalBirr sharesToSellPercent expectedTotalYieldBirr paydayDate",
      populate: {
        path: "asset",
        select: "name type",
      },
    })
    .sort({ purchasedAt: -1 });

  res.json(new ApiResponse(200, { investments }, "Active investments"));
});

// My investment history (completed)
export const getMyHistory = asyncHandler(async (req, res) => {
  const history = await ShareOwnership.find({
    investor: req.user._id,
    status: "completed",
  })
    .populate({
      path: "listing",
      select: "investmentGoalBirr expectedTotalYieldBirr",
      populate: {
        path: "asset",
        select: "name",
      },
    })
    .sort({ purchasedAt: -1 });

  res.json(new ApiResponse(200, { history }, "Investment history"));
});

// Farmer: all investments in my listings
export const getFarmerInvestments = asyncHandler(async (req, res) => {
  const farmerListings = await Listing.find({ farmer: req.user._id }).distinct(
    "_id",
  );

  const investments = await ShareOwnership.find({
    listing: { $in: farmerListings },
  })
    .populate("investor", "fullName phone")
    .populate("listing", "investmentGoalBirr sharesToSellPercent status")
    .sort({ purchasedAt: -1 });

  res.json(
    new ApiResponse(200, { investments }, "All investments in your listings"),
  );
});
