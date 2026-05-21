import express from "express";
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/upload.middleware.js";
import {
  createAsset,
  resubmitRejectedAsset,
  deleteAsset,
  getMyAssets,
  getPendingAssets,
  verifyAsset,
  getAssetById,
} from "../controllers/asset.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Farmer routes
router.post(
  "/",
  protect,
  restrictTo("farmer"),
  upload.fields([
    { name: "photos", maxCount: 5 },
    { name: "documents", maxCount: 5 },
  ]),
  asyncHandler(createAsset),
);
router.get(
  "/my-assets",
  protect,
  restrictTo("farmer"),
  asyncHandler(getMyAssets),
);
router.post(
  "/:id/resubmit",
  protect,
  restrictTo("farmer"),
  upload.fields([
    { name: "photos", maxCount: 5 },
    { name: "documents", maxCount: 5 },
  ]),
  asyncHandler(resubmitRejectedAsset),
);
router.delete("/:id", protect, restrictTo("farmer"), asyncHandler(deleteAsset));

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

export default router;
