import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import mongoose from "mongoose";
import Asset from "../models/Asset.js";
import Listing from "../models/Listing.js";
import ListingUpdate from "../models/ListingUpdate.js";
import { addCredits, deductCredits } from "../services/agriCredits.service.js";

const getFundingMetrics = (listingDoc) => {
  const listing =
    typeof listingDoc.toObject === "function"
      ? listingDoc.toObject()
      : { ...listingDoc };

  const goal = Number(listing.investmentGoalBirr || 0);
  const invested = Number(listing.totalInvestedBirr || 0);
  const progressPercent = goal > 0 ? Math.min((invested / goal) * 100, 100) : 0;

  return {
    ...listing,
    investmentProgressPercent: Number(progressPercent.toFixed(2)),
    fundingRemainingBirr: Number(Math.max(goal - invested, 0).toFixed(2)),
    isDeadlinePassed: listing.investmentDeadline
      ? new Date() > new Date(listing.investmentDeadline)
      : false,
  };
};

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
    investmentDeadline,
    payoutMode = "fixed",
    payoffDaysFromRelease,
    paydayDate,
    minSharesPerInvestor = 1,
    pitchTitle,
    pitchText,
    useOfFunds,
    riskFactors,
  } = req.body;

  const normalizedPitchTitle =
    typeof pitchTitle === "string" ? pitchTitle.trim() : "";
  const normalizedPitchText =
    typeof pitchText === "string" ? pitchText.trim() : "";
  const normalizedUseOfFunds =
    typeof useOfFunds === "string" ? useOfFunds.trim() : "";
  const normalizedRiskFactors =
    typeof riskFactors === "string" ? riskFactors.trim() : "";
  const normalizedPayoutMode =
    typeof payoutMode === "string" ? payoutMode.trim().toLowerCase() : "fixed";

  if (!["fixed", "offset"].includes(normalizedPayoutMode)) {
    throw new ApiError(400, 'payoutMode must be either "fixed" or "offset"');
  }

  const parsedInvestmentDeadline = new Date(investmentDeadline);
  if (!investmentDeadline || Number.isNaN(parsedInvestmentDeadline.getTime())) {
    throw new ApiError(
      400,
      "investmentDeadline is required and must be a valid date",
    );
  }

  if (parsedInvestmentDeadline <= new Date()) {
    throw new ApiError(400, "investmentDeadline must be in the future");
  }

  let parsedPaydayDate = null;
  let normalizedPayoffDaysFromRelease = null;

  if (normalizedPayoutMode === "fixed") {
    parsedPaydayDate = new Date(paydayDate);
    if (!paydayDate || Number.isNaN(parsedPaydayDate.getTime())) {
      throw new ApiError(
        400,
        "paydayDate is required when payoutMode is fixed",
      );
    }

    if (parsedPaydayDate <= parsedInvestmentDeadline) {
      throw new ApiError(
        400,
        "paydayDate must be after investmentDeadline when payoutMode is fixed",
      );
    }
  } else {
    const parsedDays = Number.parseInt(payoffDaysFromRelease, 10);
    if (Number.isNaN(parsedDays) || parsedDays < 1) {
      throw new ApiError(
        400,
        "payoffDaysFromRelease is required and must be at least 1 when payoutMode is offset",
      );
    }
    normalizedPayoffDaysFromRelease = parsedDays;
  }

  if (!normalizedPitchTitle) {
    throw new ApiError(400, "pitchTitle is required");
  }
  if (normalizedPitchTitle.length < 10 || normalizedPitchTitle.length > 120) {
    throw new ApiError(400, "pitchTitle must be between 10 and 120 characters");
  }

  if (!normalizedPitchText) {
    throw new ApiError(400, "pitchText is required");
  }
  if (normalizedPitchText.length < 50 || normalizedPitchText.length > 3000) {
    throw new ApiError(400, "pitchText must be between 50 and 3000 characters");
  }

  if (!normalizedUseOfFunds) {
    throw new ApiError(400, "useOfFunds is required");
  }
  if (normalizedUseOfFunds.length < 30 || normalizedUseOfFunds.length > 2000) {
    throw new ApiError(
      400,
      "useOfFunds must be between 30 and 2000 characters",
    );
  }

  if (!normalizedRiskFactors) {
    throw new ApiError(400, "riskFactors is required");
  }
  if (
    normalizedRiskFactors.length < 30 ||
    normalizedRiskFactors.length > 2000
  ) {
    throw new ApiError(
      400,
      "riskFactors must be between 30 and 2000 characters",
    );
  }

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
  let initialListingUpdate;

  try {
    listing = await Listing.create({
      asset: asset._id,
      farmer: req.user._id,
      investmentGoalBirr,
      sharesToSellPercent,
      expectedTotalYieldBirr,
      pitchTitle: normalizedPitchTitle,
      pitchText: normalizedPitchText,
      useOfFunds: normalizedUseOfFunds,
      riskFactors: normalizedRiskFactors,
      investmentDeadline: parsedInvestmentDeadline,
      payoutMode: normalizedPayoutMode,
      payoffDaysFromRelease: normalizedPayoffDaysFromRelease,
      paydayDate: parsedPaydayDate,
      effectivePaydayDate:
        normalizedPayoutMode === "fixed" ? parsedPaydayDate : null,
      minSharesPerInvestor,
      sharePricePerTokenBirr: sharePrice,
      totalInvestedBirr: 0,
      // shareTokenAddress: 'pending deploy...',   // later real address after ERC-20 deployment
    });

    initialListingUpdate = await ListingUpdate.create({
      listing: listing._id,
      farmer: req.user._id,
      title: "Listing launched for investment",
      body: "Listing launched for investment",
      postedAt: new Date(),
      isSystem: true,
    });

    // Mock for now - in real - deploy ERC-20 & transfer fractions
    listing.shareTokenAddress = "0xMockShareTokenAddressForTesting";
    listing.shareTokenSymbol = `YS-${asset._id.toString().slice(-6)}`;
    await listing.save();

    asset.currentListing = listing._id;
    asset.status = "listed";
    await asset.save();
  } catch (err) {
    if (initialListingUpdate?._id) {
      await ListingUpdate.findByIdAndDelete(initialListingUpdate._id).catch(
        () => null,
      );
    }

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
        { listing: getFundingMetrics(listing) },
        "Asset listed for investment successfully",
      ),
    );
});

export const getActiveListings = asyncHandler(async (req, res) => {
  const listings = await Listing.find({ status: "active" })
    .populate("asset")
    .populate("farmer", "fullName profilePicture")
    .sort({ createdAt: -1 });

  const listingsWithFunding = listings.map(getFundingMetrics);

  return res.json(
    new ApiResponse(
      200,
      { listings: listingsWithFunding, count: listingsWithFunding.length },
      "Active listings retrieved",
    ),
  );
});

export const getAllListings = asyncHandler(async (req, res) => {
  const listings = await Listing.find()
    .populate("asset")
    .populate("farmer", "fullName profilePicture")
    .sort({ createdAt: -1 });

  const listingsWithFunding = listings.map(getFundingMetrics);

  return res.json(
    new ApiResponse(
      200,
      { listings: listingsWithFunding, count: listingsWithFunding.length },
      "All listings retrieved",
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

  const listingsWithFunding = listings.map(getFundingMetrics);

  return res.json(
    new ApiResponse(
      200,
      { listings: listingsWithFunding, count: listingsWithFunding.length },
      "Your listings retrieved",
    ),
  );
});

export const getListingById = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new ApiError(400, "Invalid listing id");
  }

  const listing = await Listing.findById(req.params.id)
    .populate("asset")
    .populate("farmer", "fullName phone profilePicture");

  if (!listing) {
    throw new ApiError(404, "Listing not found");
  }

  return res.json(
    new ApiResponse(
      200,
      { listing: getFundingMetrics(listing) },
      "Listing details retrieved",
    ),
  );
});
