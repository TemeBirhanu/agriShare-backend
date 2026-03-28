import express from "express";
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/upload.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  submitFarmerVerification,
  getMyFarmerVerification,
  getPendingFarmerVerifications,
  reviewFarmerVerification,
} from "../controllers/farmerVerification.controller.js";

const router = express.Router();

router.get(
  "/me",
  protect,
  restrictTo("farmer"),
  asyncHandler(getMyFarmerVerification),
);

router.post(
  "/submit",
  protect,
  restrictTo("farmer"),
  upload.fields([
    { name: "idFrontImage", maxCount: 1 },
    { name: "idBackImage", maxCount: 1 },
    { name: "selfieImage", maxCount: 1 },
  ]),
  asyncHandler(submitFarmerVerification),
);

router.get(
  "/pending",
  protect,
  restrictTo("admin"),
  asyncHandler(getPendingFarmerVerifications),
);

router.patch(
  "/:id/review",
  protect,
  restrictTo("admin"),
  asyncHandler(reviewFarmerVerification),
);

export default router;
