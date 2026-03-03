const { ApiError } = require("../utils/ApiError");
const { ApiResponse } = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler").asyncHandler;
const Asset = require("../models/Asset");

const createAsset = asyncHandler(async (req, res) => {
  if (req.user.role !== "farmer") {
    throw new ApiError(403, "Only farmers can create assets");
  }

  const assetData = {
    ...req.body,
    farmer: req.user._id,
    status: "pending", // starts as pending verification
  };

  const asset = await Asset.create(assetData);

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { asset },
        "Asset created successfully and pending verification",
      ),
    );
});

module.exports = { createAsset };
