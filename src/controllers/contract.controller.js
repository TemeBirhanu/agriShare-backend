import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import InvestmentContract from "../models/InvestmentContract.js";
import mongoose from "mongoose";

export const getInvestmentContracts = asyncHandler(async (req, res) => {
  const { listingId } = req.params;
  if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
    throw new ApiError(400, "Valid listingId is required");
  }

  const query =
    req.user.role === "farmer"
      ? { farmer: req.user._id, listing: listingId }
      : { investor: req.user._id, listing: listingId };

  const contracts = await InvestmentContract.find(query)
    .populate({
      path: "listing",
      select:
        "investmentGoalBirr totalInvestedBirr investmentDeadline payoutMode effectivePaydayDate status",
      populate: {
        path: "asset",
        select: "name type",
      },
    })
    .populate("investor", "fullName email")
    .populate("farmer", "fullName email")
    .sort({ signedAt: -1 });

  res.json(
    new ApiResponse(200, { contracts }, "Investment contracts retrieved"),
  );
});
