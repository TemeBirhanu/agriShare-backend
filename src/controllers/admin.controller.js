import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import User from "../models/User.js";
import Listing from "../models/Listing.js";
import Asset from "../models/Asset.js";
import FarmerVerification from "../models/FarmerVerification.js";
import InvestmentContract from "../models/InvestmentContract.js";
import CreditTransaction from "../models/CreditTransaction.js";
import Notification from "../models/Notification.js";
import ShareOwnership from "../models/ShareOwnership.js";
import { refundListingInvestments } from "../services/refund.service.js";

const roundBirr = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const resolveDateWindow = (query) => {
  const now = new Date();
  const days = parsePositiveInt(query.days, 30);

  let endDate = query.endDate ? new Date(query.endDate) : now;
  let startDate = query.startDate
    ? new Date(query.startDate)
    : new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new ApiError(400, "Invalid startDate or endDate");
  }

  if (startDate > endDate) {
    [startDate, endDate] = [endDate, startDate];
  }

  return {
    startDate,
    endDate,
    days,
  };
};

export const getAdminDashboardOverview = asyncHandler(async (req, res) => {
  const [
    totalUsers,
    activeUsers,
    inactiveUsers,
    totalFarmers,
    totalInvestors,
    totalAdmins,
    pendingFarmerVerifications,
    pendingAssets,
    listingStatusBreakdown,
    investmentTotals,
    refundedTotals,
    unreadNotifications,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    User.countDocuments({ isActive: false }),
    User.countDocuments({ role: "farmer" }),
    User.countDocuments({ role: "investor" }),
    User.countDocuments({ role: "admin" }),
    FarmerVerification.countDocuments({ status: "pending" }),
    Asset.countDocuments({ status: "pending" }),
    Listing.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]),
    InvestmentContract.aggregate([
      {
        $group: {
          _id: null,
          totalContracts: { $sum: 1 },
          activeContracts: {
            $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
          },
          completedContracts: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          refundedContracts: {
            $sum: { $cond: [{ $eq: ["$status", "refunded"] }, 1, 0] },
          },
          grossInvestmentBirr: { $sum: "$amountPaidBirr" },
        },
      },
    ]),
    InvestmentContract.aggregate([
      {
        $match: {
          status: "refunded",
        },
      },
      {
        $group: {
          _id: null,
          refundedAmountBirr: { $sum: "$amountPaidBirr" },
        },
      },
    ]),
    Notification.countDocuments({ isRead: false }),
  ]);

  const listingStatuses = {
    active: 0,
    funded: 0,
    completed: 0,
    cancelled: 0,
    failed: 0,
    refunded: 0,
  };

  for (const row of listingStatusBreakdown) {
    listingStatuses[row._id] = row.count;
  }

  const investmentSummary = investmentTotals[0] || {
    totalContracts: 0,
    activeContracts: 0,
    completedContracts: 0,
    refundedContracts: 0,
    grossInvestmentBirr: 0,
  };

  const refundedAmountBirr = refundedTotals[0]?.refundedAmountBirr || 0;

  const overview = {
    users: {
      total: totalUsers,
      active: activeUsers,
      inactive: inactiveUsers,
      farmers: totalFarmers,
      investors: totalInvestors,
      admins: totalAdmins,
    },
    queues: {
      pendingFarmerVerifications,
      pendingAssets,
    },
    listings: listingStatuses,
    investments: {
      ...investmentSummary,
      grossInvestmentBirr: roundBirr(investmentSummary.grossInvestmentBirr),
      refundedAmountBirr: roundBirr(refundedAmountBirr),
    },
    notifications: {
      unread: unreadNotifications,
    },
    generatedAt: new Date(),
  };

  return res.json(new ApiResponse(200, overview, "Admin overview retrieved"));
});

export const getVerificationQueue = asyncHandler(async (req, res) => {
  const page = parsePositiveInt(req.query.page, 1);
  const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    FarmerVerification.countDocuments({ status: "pending" }),
    FarmerVerification.find({ status: "pending" })
      .populate(
        "user",
        "firstName lastName email phone region zone woreda kebele",
      )
      .sort({ submittedAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return res.json(
    new ApiResponse(
      200,
      {
        total,
        page,
        limit,
        hasNextPage: skip + items.length < total,
        items,
      },
      "Pending farmer verification queue retrieved",
    ),
  );
});

export const getAssetQueue = asyncHandler(async (req, res) => {
  const page = parsePositiveInt(req.query.page, 1);
  const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
  const skip = (page - 1) * limit;

  const [total, items] = await Promise.all([
    Asset.countDocuments({ status: "pending" }),
    Asset.find({ status: "pending" })
      .populate(
        "farmer",
        "firstName lastName email phone region zone woreda kebele",
      )
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return res.json(
    new ApiResponse(
      200,
      {
        total,
        page,
        limit,
        hasNextPage: skip + items.length < total,
        items,
      },
      "Pending asset verification queue retrieved",
    ),
  );
});

export const getListingsRiskQueue = asyncHandler(async (req, res) => {
  const page = parsePositiveInt(req.query.page, 1);
  const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
  const daysWindow = parsePositiveInt(req.query.daysWindow, 10);
  const maxFundingProgressPercent = Math.min(
    parsePositiveInt(req.query.maxFundingProgressPercent, 80),
    100,
  );
  const skip = (page - 1) * limit;

  const now = new Date();
  const windowEnd = new Date(now.getTime() + daysWindow * 24 * 60 * 60 * 1000);

  const pipeline = [
    {
      $match: {
        status: "active",
        investmentDeadline: { $gte: now, $lte: windowEnd },
      },
    },
    {
      $addFields: {
        fundingProgressPercent: {
          $cond: [
            { $gt: ["$investmentGoalBirr", 0] },
            {
              $multiply: [
                { $divide: ["$totalInvestedBirr", "$investmentGoalBirr"] },
                100,
              ],
            },
            0,
          ],
        },
      },
    },
    {
      $match: {
        fundingProgressPercent: { $lte: maxFundingProgressPercent },
      },
    },
    {
      $sort: { investmentDeadline: 1 },
    },
    {
      $facet: {
        metadata: [{ $count: "total" }],
        items: [
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: "users",
              localField: "farmer",
              foreignField: "_id",
              as: "farmer",
            },
          },
          {
            $unwind: {
              path: "$farmer",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $project: {
              asset: 1,
              status: 1,
              investmentGoalBirr: 1,
              totalInvestedBirr: 1,
              investmentDeadline: 1,
              payoutMode: 1,
              fundingProgressPercent: {
                $round: ["$fundingProgressPercent", 2],
              },
              farmer: {
                _id: "$farmer._id",
                firstName: "$farmer.firstName",
                lastName: "$farmer.lastName",
                email: "$farmer.email",
                phone: "$farmer.phone",
              },
            },
          },
        ],
      },
    },
  ];

  const [result] = await Listing.aggregate(pipeline);
  const total = result?.metadata?.[0]?.total || 0;
  const items = result?.items || [];

  return res.json(
    new ApiResponse(
      200,
      {
        total,
        page,
        limit,
        filters: {
          daysWindow,
          maxFundingProgressPercent,
        },
        hasNextPage: skip + items.length < total,
        items,
      },
      "Listing risk queue retrieved",
    ),
  );
});

export const getInvestmentAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate, days } = resolveDateWindow(req.query);

  const match = {
    signedAt: {
      $gte: startDate,
      $lte: endDate,
    },
  };

  const [summaryRows, byDay, topListings] = await Promise.all([
    InvestmentContract.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          contractCount: { $sum: 1 },
          totalInvestedBirr: { $sum: "$amountPaidBirr" },
          uniqueInvestors: { $addToSet: "$investor" },
        },
      },
      {
        $project: {
          _id: 0,
          contractCount: 1,
          totalInvestedBirr: 1,
          uniqueInvestorCount: { $size: "$uniqueInvestors" },
          averageTicketBirr: {
            $cond: [
              { $gt: ["$contractCount", 0] },
              { $divide: ["$totalInvestedBirr", "$contractCount"] },
              0,
            ],
          },
        },
      },
    ]),
    InvestmentContract.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$signedAt" },
          },
          contractCount: { $sum: 1 },
          totalInvestedBirr: { $sum: "$amountPaidBirr" },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: "$_id",
          contractCount: 1,
          totalInvestedBirr: { $round: ["$totalInvestedBirr", 2] },
        },
      },
    ]),
    InvestmentContract.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$listing",
          contractCount: { $sum: 1 },
          totalInvestedBirr: { $sum: "$amountPaidBirr" },
        },
      },
      { $sort: { totalInvestedBirr: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "listings",
          localField: "_id",
          foreignField: "_id",
          as: "listing",
        },
      },
      {
        $unwind: {
          path: "$listing",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          listingId: "$_id",
          contractCount: 1,
          totalInvestedBirr: { $round: ["$totalInvestedBirr", 2] },
          status: "$listing.status",
          investmentGoalBirr: "$listing.investmentGoalBirr",
          totalInvestedListingBirr: "$listing.totalInvestedBirr",
        },
      },
    ]),
  ]);

  const summary = summaryRows[0] || {
    contractCount: 0,
    totalInvestedBirr: 0,
    uniqueInvestorCount: 0,
    averageTicketBirr: 0,
  };

  summary.totalInvestedBirr = roundBirr(summary.totalInvestedBirr);
  summary.averageTicketBirr = roundBirr(summary.averageTicketBirr);

  return res.json(
    new ApiResponse(
      200,
      {
        window: {
          startDate,
          endDate,
          days,
        },
        summary,
        byDay,
        topListings,
      },
      "Investment analytics retrieved",
    ),
  );
});

export const getDistributionAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate, days } = resolveDateWindow(req.query);

  const [contractSummaryRows, shareSummaryRows, refundedListingsCount] =
    await Promise.all([
      InvestmentContract.aggregate([
        {
          $match: {
            updatedAt: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            amountBirr: { $sum: "$amountPaidBirr" },
          },
        },
      ]),
      ShareOwnership.aggregate([
        {
          $match: {
            updatedAt: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: "$status",
            investorPayoutBirr: { $sum: "$distributedAmountBirr" },
          },
        },
      ]),
      Listing.countDocuments({
        status: "refunded",
        refundedAt: {
          $gte: startDate,
          $lte: endDate,
        },
      }),
    ]);

  const contractSummary = {
    activeContracts: 0,
    completedContracts: 0,
    refundedContracts: 0,
    completedContractValueBirr: 0,
    refundedContractValueBirr: 0,
  };

  for (const row of contractSummaryRows) {
    if (row._id === "active") {
      contractSummary.activeContracts = row.count;
    }
    if (row._id === "completed") {
      contractSummary.completedContracts = row.count;
      contractSummary.completedContractValueBirr = roundBirr(row.amountBirr);
    }
    if (row._id === "refunded") {
      contractSummary.refundedContracts = row.count;
      contractSummary.refundedContractValueBirr = roundBirr(row.amountBirr);
    }
  }

  const investorPayoutBirr = roundBirr(
    (shareSummaryRows.find((row) => row._id === "completed")
      ?.investorPayoutBirr || 0) +
      (shareSummaryRows.find((row) => row._id === "active")
        ?.investorPayoutBirr || 0),
  );

  return res.json(
    new ApiResponse(
      200,
      {
        window: {
          startDate,
          endDate,
          days,
        },
        summary: {
          ...contractSummary,
          refundedListings: refundedListingsCount,
          investorPayoutBirr,
        },
      },
      "Distribution analytics retrieved",
    ),
  );
});

export const getCreditsAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate, days } = resolveDateWindow(req.query);

  const match = {
    createdAt: {
      $gte: startDate,
      $lte: endDate,
    },
  };

  const [summaryRows, byType, byDay] = await Promise.all([
    CreditTransaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          transactionCount: { $sum: 1 },
          totalAbsoluteVolume: { $sum: { $abs: "$amount" } },
          positiveCredits: {
            $sum: {
              $cond: [{ $gt: ["$amount", 0] }, "$amount", 0],
            },
          },
          negativeCredits: {
            $sum: {
              $cond: [{ $lt: ["$amount", 0] }, { $abs: "$amount" }, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          transactionCount: 1,
          totalAbsoluteVolume: 1,
          positiveCredits: 1,
          negativeCredits: 1,
        },
      },
    ]),
    CreditTransaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$type",
          transactionCount: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          absoluteVolume: { $sum: { $abs: "$amount" } },
        },
      },
      { $sort: { absoluteVolume: -1 } },
      {
        $project: {
          _id: 0,
          type: "$_id",
          transactionCount: 1,
          totalAmount: { $round: ["$totalAmount", 2] },
          absoluteVolume: { $round: ["$absoluteVolume", 2] },
        },
      },
    ]),
    CreditTransaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          transactionCount: { $sum: 1 },
          absoluteVolume: { $sum: { $abs: "$amount" } },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: "$_id",
          transactionCount: 1,
          absoluteVolume: { $round: ["$absoluteVolume", 2] },
        },
      },
    ]),
  ]);

  const summary = summaryRows[0] || {
    transactionCount: 0,
    totalAbsoluteVolume: 0,
    positiveCredits: 0,
    negativeCredits: 0,
  };

  summary.totalAbsoluteVolume = roundBirr(summary.totalAbsoluteVolume);
  summary.positiveCredits = roundBirr(summary.positiveCredits);
  summary.negativeCredits = roundBirr(summary.negativeCredits);

  return res.json(
    new ApiResponse(
      200,
      {
        window: {
          startDate,
          endDate,
          days,
        },
        summary,
        byType,
        byDay,
      },
      "AgriCredits analytics retrieved",
    ),
  );
});

export const triggerRefundForListingOperation = asyncHandler(
  async (req, res) => {
    const { listingId } = req.params;
    const { force = true, reason } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(listingId)) {
      throw new ApiError(400, "Invalid listingId");
    }

    const normalizedReason =
      typeof reason === "string" && reason.trim()
        ? reason.trim()
        : "admin_operation_refund";

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
        {
          refund: result,
        },
        "Refund operation completed",
      ),
    );
  },
);
