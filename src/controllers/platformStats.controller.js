import Asset from "../models/Asset.js";
import InvestmentContract from "../models/InvestmentContract.js";
import User from "../models/User.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const roundNumber = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export const getPlatformStats = asyncHandler(async (req, res) => {
  const [activeFarmers, verifiedAssets, totalAssets, tradedValueTotals] =
    await Promise.all([
      User.countDocuments({ role: "farmer", isActive: true }),
      Asset.countDocuments({ status: "verified" }),
      Asset.countDocuments(),
      InvestmentContract.aggregate([
        {
          $group: {
            _id: null,
            tradedValueBirr: { $sum: "$amountPaidBirr" },
          },
        },
      ]),
    ]);

  const tradedValueBirr = roundNumber(
    tradedValueTotals[0]?.tradedValueBirr || 0,
  );
  const verifiedAssetRate =
    totalAssets > 0 ? roundNumber((verifiedAssets / totalAssets) * 100) : 0;

  return res.json(
    new ApiResponse(
      200,
      {
        activeFarmers,
        verifiedAssets: {
          total: totalAssets,
          verified: verifiedAssets,
          rate: verifiedAssetRate,
        },
        tradedValueBirr,
        generatedAt: new Date(),
      },
      "Platform stats retrieved successfully",
    ),
  );
});