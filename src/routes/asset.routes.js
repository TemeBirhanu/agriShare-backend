const express = require("express");
const router = express.Router();

const { protect, restrictTo } = require("../middlewares/auth.middleware");

const {
  createAsset,
  getMyAssets,
  getPendingAssets,
  verifyAsset,
  getAssetById,
} = require("../controllers/asset.controller");

const asyncHandler = require("../utils/asyncHandler").asyncHandler;

// Farmer routes
router.post("/", protect, restrictTo("farmer"), asyncHandler(createAsset));
router.get(
  "/my-assets",
  protect,
  restrictTo("farmer"),
  asyncHandler(getMyAssets),
);

// Admin routes
router.get(
  "/pending",
  protect,
  restrictTo("admin"),
  asyncHandler(getPendingAssets),
);

router.patch(
  "/:id/verify",
  protect,
  restrictTo("admin"),
  asyncHandler(verifyAsset),
);

router.get("/:id", protect, asyncHandler(getAssetById));

module.exports = router;
