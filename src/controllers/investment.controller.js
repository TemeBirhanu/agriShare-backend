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
import InvestorRefundRequest from "../models/InvestorRefundRequest.js";
import { createNotificationSafe } from "../services/notification.service.js";
import { approveInvestorRefundRequest } from "../services/refund.service.js";

const roundBirr = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const isTransactionNotSupportedError = (error) =>
  error?.code === 20 ||
  error?.codeName === "IllegalOperation" ||
  String(error?.message || "").includes(
    "Transaction numbers are only allowed on a replica set member or mongos",
  );

const withSession = (session) => (session ? { session } : {});

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

export const buyInvestmentShares = asyncHandler(async (req, res) => {
  if (req.user.role !== "investor") {
    throw new ApiError(403, "Only investors can buy shares");
  }

  const { listingId } = req.params;
  if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
    throw new ApiError(400, "Valid listingId is required");
  }

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

      await createNotificationSafe({
        recipient: listing.farmer,
        type: "listing_goal_reached",
        title: "Congratulations! Funding Goal Achieved",
        message: `Your listing \"${
          listing.pitchTitle || "investment listing"
        }\" has reached its investment goal of ${
          listing.investmentGoalBirr
        } Birr.`,
        referenceId: listing._id,
        referenceModel: "Listing",
        meta: {
          totalInvestedBirr: listing.totalInvestedBirr,
          investmentGoalBirr: listing.investmentGoalBirr,
        },
      });
    }

    await listing.save(withSession(session));

    await createNotificationSafe({
      recipient: listing.farmer,
      type: "listing_share_sold",
      title: "Share Sold",
      message: `${requestedShares} share(s) were sold in \"${
        listing.pitchTitle || "your listing"
      }\" for ${costBirr} Birr.`,
      referenceId: listing._id,
      referenceModel: "Listing",
      meta: {
        sharesSold: requestedShares,
        amountBirr: costBirr,
        investorId: req.user._id,
        investorName: `${req.user.firstName} ${req.user.lastName}`.trim(),
      },
    });

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

export const submitInvestorRefundRequest = asyncHandler(async (req, res) => {
  if (req.user.role !== "investor") {
    throw new ApiError(403, "Only investors can submit refund requests");
  }

  const { listingId } = req.params;
  const { reason } = req.body;
  if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
    throw new ApiError(400, "Valid listingId is required");
  }

  const listing = await Listing.findById(listingId)
    .select("_id status farmer pitchTitle")
    .lean();
  if (!listing) {
    throw new ApiError(404, "Listing not found");
  }

  if (listing.status !== "active") {
    throw new ApiError(
      400,
      "Refund request can only be submitted while listing is active",
    );
  }

  const existingPending = await InvestorRefundRequest.findOne({
    listing: listing._id,
    investor: req.user._id,
    status: "pending",
  });

  if (existingPending) {
    throw new ApiError(
      409,
      "You already have a pending refund request for this listing",
    );
  }

  const contracts = await InvestmentContract.find({
    listing: listing._id,
    investor: req.user._id,
    status: { $in: ["active", "disputed"] },
  })
    .select("amountPaidBirr sharesPurchased")
    .lean();

  if (contracts.length === 0) {
    throw new ApiError(
      400,
      "No active or disputed investments found for this listing",
    );
  }

  const requestedAmountBirr = contracts.reduce(
    (sum, contract) => roundBirr(sum + Number(contract.amountPaidBirr || 0)),
    0,
  );

  const requestedShares = contracts.reduce(
    (sum, contract) => sum + Number(contract.sharesPurchased || 0),
    0,
  );

  const normalizedReason =
    typeof reason === "string" && reason.trim() ? reason.trim() : null;

  const refundRequest = await InvestorRefundRequest.create({
    listing: listing._id,
    investor: req.user._id,
    farmer: listing.farmer,
    status: "pending",
    investorReason: normalizedReason,
    requestedAmountBirr,
    requestedShares,
    requestedContractCount: contracts.length,
    requestedAt: new Date(),
  });

  await createNotificationSafe({
    recipient: listing.farmer,
    type: "investor_refund_request",
    title: "Investor Refund Request Submitted",
    message: `An investor submitted a refund request for listing \"${
      listing.pitchTitle || "your listing"
    }\".`,
    referenceId: refundRequest._id,
    referenceModel: "InvestorRefundRequest",
    meta: {
      listingId: String(listing._id),
      investorId: String(req.user._id),
      requestedAmountBirr,
    },
  });

  const adminUsers = await User.find({ role: "admin", isActive: true })
    .select("_id")
    .lean();

  await Promise.all(
    adminUsers.map((adminUser) =>
      createNotificationSafe({
        recipient: adminUser._id,
        type: "investor_refund_request",
        title: "New Investor Refund Request",
        message: `${req.user.firstName} ${
          req.user.lastName
        } requested refund for listing \"${
          listing.pitchTitle || "investment listing"
        }\".`,
        referenceId: refundRequest._id,
        referenceModel: "InvestorRefundRequest",
        meta: {
          listingId: String(listing._id),
          investorId: String(req.user._id),
          requestedAmountBirr,
        },
      }),
    ),
  );

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { refundRequest },
        "Refund request submitted and pending admin review",
      ),
    );
});

export const getMyRefundRequests = asyncHandler(async (req, res) => {
  if (req.user.role !== "investor") {
    throw new ApiError(403, "Only investors can view their refund requests");
  }

  const page = parsePositiveInt(req.query.page, 1);
  const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
  const skip = (page - 1) * limit;

  const allowedStatuses = ["pending", "approved", "rejected", "all"];
  const status = String(req.query.status || "all")
    .trim()
    .toLowerCase();

  if (!allowedStatuses.includes(status)) {
    throw new ApiError(400, "Invalid status filter");
  }

  const query = { investor: req.user._id };
  if (status !== "all") {
    query.status = status;
  }

  const [total, refundRequests] = await Promise.all([
    InvestorRefundRequest.countDocuments(query),
    InvestorRefundRequest.find(query)
      .populate("listing", "_id status investmentGoalBirr totalInvestedBirr")
      .populate("reviewedBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
  ]);

  return res.json(
    new ApiResponse(
      200,
      {
        refundRequests,
        total,
        page,
        limit,
        hasNextPage: skip + refundRequests.length < total,
      },
      "Refund requests retrieved successfully",
    ),
  );
});

export const getPendingInvestorRefundRequestsForAdmin = asyncHandler(
  async (req, res) => {
    if (req.user.role !== "admin") {
      throw new ApiError(403, "Only admins can view investor refund requests");
    }

    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
    const skip = (page - 1) * limit;

    const allowedStatuses = ["pending", "approved", "rejected", "all"];
    const status = String(req.query.status || "pending")
      .trim()
      .toLowerCase();

    if (!allowedStatuses.includes(status)) {
      throw new ApiError(400, "Invalid status filter");
    }

    const query = {};
    if (status !== "all") {
      query.status = status;
    }

    const [total, refundRequests] = await Promise.all([
      InvestorRefundRequest.countDocuments(query),
      InvestorRefundRequest.find(query)
        .populate("investor", "firstName lastName email phone")
        .populate("farmer", "firstName lastName email phone")
        .populate(
          "listing",
          "_id status pitchTitle investmentGoalBirr totalInvestedBirr",
        )
        .populate("reviewedBy", "firstName lastName email")
        .sort({ status: 1, createdAt: 1 })
        .skip(skip)
        .limit(limit),
    ]);

    return res.json(
      new ApiResponse(
        200,
        {
          refundRequests,
          total,
          page,
          limit,
          hasNextPage: skip + refundRequests.length < total,
        },
        "Investor refund requests retrieved",
      ),
    );
  },
);

export const reviewInvestorRefundRequestByAdmin = asyncHandler(
  async (req, res) => {
    if (req.user.role !== "admin") {
      throw new ApiError(403, "Only admins can review refund requests");
    }

    const requestId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      throw new ApiError(400, "Invalid refund request id");
    }

    const status = String(req.body.status || "")
      .trim()
      .toLowerCase();
    const normalizedAdminNote =
      typeof req.body.adminNote === "string" && req.body.adminNote.trim()
        ? req.body.adminNote.trim()
        : null;

    if (!["approved", "rejected"].includes(status)) {
      throw new ApiError(400, 'status must be either "approved" or "rejected"');
    }

    const refundRequest = await InvestorRefundRequest.findById(requestId)
      .populate("investor", "firstName lastName email")
      .populate("listing", "_id status pitchTitle")
      .lean();

    if (!refundRequest) {
      throw new ApiError(404, "Refund request not found");
    }

    if (refundRequest.status !== "pending") {
      throw new ApiError(
        400,
        `Refund request is already ${refundRequest.status}`,
      );
    }

    if (status === "rejected") {
      const rejectedRequest = await InvestorRefundRequest.findByIdAndUpdate(
        requestId,
        {
          $set: {
            status: "rejected",
            adminNote: normalizedAdminNote,
            reviewedBy: req.user._id,
            reviewedAt: new Date(),
          },
        },
        { new: true },
      )
        .populate("investor", "firstName lastName email")
        .populate("listing", "_id status pitchTitle")
        .populate("reviewedBy", "firstName lastName email");

      await createNotificationSafe({
        recipient: rejectedRequest.investor._id,
        type: "investor_refund_request_rejected",
        title: "Refund Request Rejected",
        message: `Your refund request for listing \"${
          rejectedRequest.listing?.pitchTitle || "investment listing"
        }\" was rejected${
          normalizedAdminNote ? `: ${normalizedAdminNote}` : "."
        }`,
        referenceId: rejectedRequest._id,
        referenceModel: "InvestorRefundRequest",
        meta: {
          status: "rejected",
          adminNote: normalizedAdminNote,
        },
      });

      return res.json(
        new ApiResponse(
          200,
          { refundRequest: rejectedRequest },
          "Refund request rejected",
        ),
      );
    }

    const approvalResult = await approveInvestorRefundRequest(requestId, {
      adminId: req.user._id,
      adminNote: normalizedAdminNote,
    });

    const approvedRequest = await InvestorRefundRequest.findById(requestId)
      .populate("investor", "firstName lastName email")
      .populate("listing", "_id status pitchTitle totalInvestedBirr")
      .populate("reviewedBy", "firstName lastName email");

    await createNotificationSafe({
      recipient: approvedRequest.investor._id,
      type: "investor_refund_request_approved",
      title: "Refund Request Approved",
      message: `Your refund request for listing \"${
        approvedRequest.listing?.pitchTitle || "investment listing"
      }\" has been approved and ${
        approvalResult.refundedAmountBirr
      } Birr was credited to your wallet.`,
      referenceId: approvedRequest._id,
      referenceModel: "InvestorRefundRequest",
      meta: {
        status: "approved",
        refundedAmountBirr: approvalResult.refundedAmountBirr,
      },
    });

    return res.json(
      new ApiResponse(
        200,
        {
          refundRequest: approvedRequest,
          settlement: approvalResult,
        },
        "Refund request approved and settled",
      ),
    );
  },
);
