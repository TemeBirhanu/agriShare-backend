import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  purchaseBundle,
  grantMonthlyCredits,
} from "../services/agriCredits.service.js";

export const buyBundle = asyncHandler(async (req, res) => {
  if (req.user.role !== "farmer") {
    throw new ApiError(403, "Only farmers can buy AgriCredits bundles");
  }

  const { bundle } = req.body; // "starter", "pro", or "mega"

  const result = await purchaseBundle(req.user._id, bundle);

  return res.json(
    new ApiResponse(200, result, "Bundle purchased successfully from wallet"),
  );
});

export const triggerMonthlyReset = asyncHandler(async (req, res) => {
  // For testing only (in production → cron job)
  const result = await grantMonthlyCredits(req.user._id);
  res.json(new ApiResponse(200, result, "Monthly credits granted"));
});
