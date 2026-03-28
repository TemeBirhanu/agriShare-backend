import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import InvestmentContract from "../models/InvestmentContract.js";

export const getInvestmentContracts = asyncHandler(async (req, res) => {
  const query =
    req.user.role === "farmer"
      ? { farmer: req.user._id }
      : { investor: req.user._id };

  const contracts = await InvestmentContract.find(query)
    .populate("listing asset investor farmer", "name type fullName")
    .sort({ signedAt: -1 });

  res.json(
    new ApiResponse(200, { contracts }, "Investment contracts retrieved"),
  );
});
