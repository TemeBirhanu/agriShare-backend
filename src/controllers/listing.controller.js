import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Asset from "../models/Asset.js";
import Listing from "../models/Listing.js";
import { addCredits, deductCredits } from "../services/agriCredits.service.js";

export const createListing = asyncHandler(async (req, res) => {
  if (req.user.role !== "farmer") {
    throw new ApiError(403, "Only farmers can list assets");
  }

  if (req.user.verificationStatus !== "verified") {
    throw new ApiError(
      403,
      "Farmer account must be verified before listing assets",
    );
  }

  const {
    assetId,
    investmentGoalBirr,
    sharesToSellPercent,
    expectedTotalYieldBirr,
    paydayDate,
    minSharesPerInvestor = 1,
  } = req.body;

  const asset = await Asset.findById(assetId);
  if (!asset) throw new ApiError(404, "Asset not found");
  if (asset.farmer.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Not your asset");
  }
  if (asset.status !== "verified") {
    throw new ApiError(400, "Asset must be verified before listing");
  }
  if (asset.currentListing) {
    throw new ApiError(400, "Asset already listed");
  }

  // Calculate price per share token (100 total shares)
  const sharesToSell = Math.round(100 * (sharesToSellPercent / 100));
  if (sharesToSell <= 0) {
    throw new ApiError(400, "Invalid shares to sell percent");
  }
  const sharePrice = investmentGoalBirr / sharesToSell;

  await deductCredits(
    req.user._id,
    20,
    "deduction_listing",
    `Listing new asset: ${asset.name || "unnamed"}`,
    asset._id,
    "Asset",
  );

  let listing;

  try {
    listing = await Listing.create({
      asset: asset._id,
      farmer: req.user._id,
      investmentGoalBirr,
      sharesToSellPercent,
      expectedTotalYieldBirr,
      paydayDate: new Date(paydayDate),
      minSharesPerInvestor,
      sharePricePerTokenBirr: sharePrice,
      // shareTokenAddress: 'pending deploy...',   // later real address after ERC-20 deployment
    });

    // Mock for now - in real - deploy ERC-20 & transfer fractions
    listing.shareTokenAddress = "0xMockShareTokenAddressForTesting";
    listing.shareTokenSymbol = `YS-${asset._id.toString().slice(-6)}`;
    await listing.save();

    asset.currentListing = listing._id;
    asset.status = "listed";
    await asset.save();
  } catch (err) {
    if (listing?._id) {
      await Listing.findByIdAndDelete(listing._id).catch(() => null);
    }

    await addCredits(
      req.user._id,
      20,
      "refund_listing",
      "Refund: listing creation failed",
      asset._id,
      "Asset",
    ).catch(() => null);

    throw err;
  }

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { listing },
        "Asset listed for investment successfully",
      ),
    );
});

export const getActiveListings = asyncHandler(async (req, res) => {
  const listings = await Listing.find({ status: "active" })
    .populate("asset")
    .populate("farmer", "fullName profilePicture")
    .sort({ createdAt: -1 });

  return res.json(
    new ApiResponse(
      200,
      { listings, count: listings.length },
      "Active listings retrieved",
    ),
  );
});

export const getMyListings = asyncHandler(async (req, res) => {
  if (req.user.role !== "farmer") {
    throw new ApiError(403, "Only farmers can view their own listings");
  }

  const listings = await Listing.find({ farmer: req.user._id })
    .populate("asset")
    .sort({ createdAt: -1 });

  return res.json(
    new ApiResponse(
      200,
      { listings, count: listings.length },
      "Your listings retrieved",
    ),
  );
});

export const getListingById = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id)
    .populate("asset")
    .populate("farmer", "fullName phone profilePicture");

  if (!listing) {
    throw new ApiError(404, "Listing not found");
  }

  return res.json(
    new ApiResponse(200, { listing }, "Listing details retrieved"),
  );
});
