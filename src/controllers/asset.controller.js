const { ApiError } = require("../utils/ApiError");
const { ApiResponse } = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler").asyncHandler;
const Asset = require("../models/Asset");

// Create asset
const createAsset = asyncHandler(async (req, res) => {
  if (req.user.role !== "farmer") {
    throw new ApiError(403, "Only farmers can create assets");
  }

  const assetData = {
    ...req.body,
    farmer: req.user._id,
    status: "pending",
  };

  const asset = await Asset.create(assetData);

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { asset },
        "Asset created successfully – awaiting verification",
      ),
    );
});

//  Get single asset (public or auth – for now anyone can see details)
const getAssetById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const asset = await Asset.findById(id)
    .populate("farmer", "fullName phone")
    .populate("verifiedBy", "fullName")
    .select("-__v");

  if (!asset) {
    throw new ApiError(404, "Asset not found");
  }

  return res.json(new ApiResponse(200, { asset }, "Asset details retrieved"));
});

// Get my assets
const getMyAssets = asyncHandler(async (req, res) => {
  if (req.user.role !== "farmer") {
    throw new ApiError(403, "Only farmers can view their own assets");
  }

  const assets = await Asset.find({ farmer: req.user._id })
    .sort({ createdAt: -1 })
    .select("-__v"); // exclude version key

  return res.json(
    new ApiResponse(
      200,
      { assets, count: assets.length },
      "Your assets retrieved",
    ),
  );
});

// Get pending assets (admin only – for verification dashboard)
const getPendingAssets = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    throw new ApiError(403, "Only admins can view pending assets");
  }

  const assets = await Asset.find({ status: "pending" })
    .populate("farmer", "fullName phone email") // show farmer info
    .sort({ createdAt: 1 })
    .select("-__v");

  return res.json(
    new ApiResponse(
      200,
      { assets, count: assets.length },
      "Pending assets for verification",
    ),
  );
});

// Verify / Reject asset (admin only)
const verifyAsset = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    throw new ApiError(403, "Only admins can verify assets");
  }

  const { id } = req.params;
  const { status, comment } = req.body; // status: 'verified' or 'rejected', comment optional

  if (!["verified", "rejected"].includes(status)) {
    throw new ApiError(400, 'Status must be "verified" or "rejected"');
  }

  const asset = await Asset.findById(id);
  if (!asset) {
    throw new ApiError(404, "Asset not found");
  }

  if (asset.status !== "pending") {
    throw new ApiError(400, `Asset is already ${asset.status}`);
  }

  asset.status = status;
  asset.verificationComment = comment || undefined;
  asset.verifiedBy = req.user._id;
  asset.verifiedAt = new Date();

  await asset.save();

  const message =
    status === "verified" ? "Asset verified successfully" : "Asset rejected";

  return res.json(new ApiResponse(200, { asset }, message));
});

module.exports = {
  createAsset,
  getMyAssets,
  getPendingAssets,
  verifyAsset,
  getAssetById,
};
