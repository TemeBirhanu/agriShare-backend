import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import mongoose from "mongoose";
import Listing from "../models/Listing.js";
import User from "../models/User.js";
import {
  getAvailableShares,
  upsertShareOwnership,
} from "../services/token.service.js";
import InvestmentContract from "../models/InvestmentContract.js";
import ShareOwnership from "../models/ShareOwnership.js";

const roundBirr = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const isTransactionNotSupportedError = (error) =>
  error?.code === 20 ||
  error?.codeName === "IllegalOperation" ||
  String(error?.message || "").includes(
    "Transaction numbers are only allowed on a replica set member or mongos",
  );

const withSession = (session) => (session ? { session } : {});

export const buyInvestmentShares = asyncHandler(async (req, res) => {
  if (req.user.role !== "investor") {
    throw new ApiError(403, "Only investors can buy shares");
  }

  const { listingId } = req.body;
  const requestedShares = Number.parseInt(req.body.sharesToBuy, 10);
  if (Number.isNaN(requestedShares) || requestedShares < 1) {
    throw new ApiError(400, "sharesToBuy must be a positive integer");
  }

  const processInvestmentPurchase = async (session = null) => {
    const listingQuery = Listing.findById(listingId);
    const listing = session
      ? await listingQuery.session(session)
      : await listingQuery;

    if (!listing) {
      throw new ApiError(404, "Listing not found");
    }

    if (listing.status !== "active") {
      throw new ApiError(400, "Listing is not open for investment");
    }

    if (
      listing.investmentDeadline &&
      new Date() > new Date(listing.investmentDeadline)
    ) {
      throw new ApiError(
        400,
        "Investment deadline has passed for this listing",
      );
    }

    const available = await getAvailableShares(listing._id, session);
    if (requestedShares > available) {
      throw new ApiError(400, `Only ${available} shares available`);
    }

    if (requestedShares < listing.minSharesPerInvestor) {
      throw new ApiError(
        400,
        `Minimum ${listing.minSharesPerInvestor} shares required`,
      );
    }

    const costBirr = roundBirr(
      requestedShares * listing.sharePricePerTokenBirr,
    );
    const remainingFundingNeedBirr = roundBirr(
      Number(listing.investmentGoalBirr) -
        Number(listing.totalInvestedBirr || 0),
    );

    if (costBirr > remainingFundingNeedBirr + 0.0001) {
      throw new ApiError(
        400,
        "Requested shares exceed remaining funding amount for this listing",
      );
    }

    const investor = await User.findOneAndUpdate(
      {
        _id: req.user._id,
        walletBalance: { $gte: costBirr },
      },
      {
        $inc: { walletBalance: -costBirr },
      },
      { new: true, ...withSession(session) },
    );

    if (!investor) {
      throw new ApiError(
        400,
        "Insufficient wallet balance for this investment",
      );
    }

    const farmer = await User.findByIdAndUpdate(
      listing.farmer,
      { $inc: { fundWalletBalance: costBirr } },
      { new: true, ...withSession(session) },
    );

    if (!farmer) {
      throw new ApiError(404, "Farmer account not found");
    }

    await upsertShareOwnership(
      listing._id,
      req.user._id,
      requestedShares,
      session,
    );

    let contract;
    const contractPayload = {
      listing: listing._id,
      investor: req.user._id,
      farmer: listing.farmer,
      sharesPurchased: requestedShares,
      amountPaidBirr: costBirr,
      status: "active",
    };

    if (session) {
      const createdContracts = await InvestmentContract.create(
        [contractPayload],
        {
          session,
        },
      );
      contract = createdContracts[0];
    } else {
      contract = await InvestmentContract.create(contractPayload);
    }

    listing.totalInvestedBirr = roundBirr(
      Number(listing.totalInvestedBirr || 0) + costBirr,
    );

    let fundsReleased = false;
    let releasedAmountBirr = 0;
    const goalReached =
      Number(listing.totalInvestedBirr) >= Number(listing.investmentGoalBirr);

    if (goalReached) {
      listing.status = "funded";
      listing.fundingGoalReachedAt = new Date();

      releasedAmountBirr = Number(listing.totalInvestedBirr);

      const farmerAfterRelease = await User.findOneAndUpdate(
        {
          _id: listing.farmer,
          fundWalletBalance: { $gte: releasedAmountBirr },
        },
        {
          $inc: {
            fundWalletBalance: -releasedAmountBirr,
            walletBalance: releasedAmountBirr,
          },
        },
        { new: true, ...withSession(session) },
      );

      if (!farmerAfterRelease) {
        throw new ApiError(
          409,
          "Unable to release escrow funds to farmer due to balance mismatch",
        );
      }

      listing.releasedToFarmerAt = new Date();
      listing.refundedAt = null;
      listing.refundReason = null;

      if (listing.payoutMode === "offset" && listing.payoffDaysFromRelease) {
        const dayMs = 24 * 60 * 60 * 1000;
        listing.effectivePaydayDate = new Date(
          listing.releasedToFarmerAt.getTime() +
            Number(listing.payoffDaysFromRelease) * dayMs,
        );
      } else {
        listing.effectivePaydayDate =
          listing.paydayDate || listing.effectivePaydayDate;
      }

      fundsReleased = true;
    }

    await listing.save(withSession(session));

    return {
      success: true,
      sharesBought: requestedShares,
      remaining: available - requestedShares,
      costBirr,
      contractNumber: contract.contractNumber,
      contractId: contract._id,
      totalInvestedBirr: listing.totalInvestedBirr,
      investmentGoalBirr: listing.investmentGoalBirr,
      investmentProgressPercent: Number(
        Math.min(
          (Number(listing.totalInvestedBirr) /
            Number(listing.investmentGoalBirr || 1)) *
            100,
          100,
        ).toFixed(2),
      ),
      fundingStatus: listing.status,
      fundsReleased,
      releasedAmountBirr,
      releasedToFarmerAt: listing.releasedToFarmerAt,
      effectivePaydayDate: listing.effectivePaydayDate,
      message: "Shares purchased & investment contract created",
    };
  };

  let responsePayload = null;
  const session = await mongoose.startSession();
  try {
    try {
      await session.withTransaction(async () => {
        responsePayload = await processInvestmentPurchase(session);
      });
    } catch (error) {
      if (!isTransactionNotSupportedError(error)) {
        throw error;
      }

      // Fallback for standalone MongoDB instances that do not support transactions.
      responsePayload = await processInvestmentPurchase(null);
    }
  } finally {
    await session.endSession();
  }

  // Return in response
  return res.json(
    new ApiResponse(200, responsePayload, "Investment successful"),
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
        "investmentGoalBirr totalInvestedBirr sharesToSellPercent expectedTotalYieldBirr paydayDate effectivePaydayDate investmentDeadline status",
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
    status: { $in: ["completed", "refunded"] },
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
