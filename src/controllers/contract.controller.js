import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import InvestmentContract from "../models/InvestmentContract.js";

export const getInvestmentContracts = asyncHandler(async (req, res) => {
  const query =
    req.user.role === "farmer"
      ? { farmer: req.user._id }
      : { investor: req.user._id };

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
