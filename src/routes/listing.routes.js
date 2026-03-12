import express from "express";
const router = express.Router();
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import {
  createListing,
  getActiveListings,
  getMyListings,
  getListingById,
} from "../controllers/listing.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

router.post("/", protect, restrictTo("farmer"), createListing);
router.get("/active", protect, asyncHandler(getActiveListings));
router.get(
  "/my-listings",
  protect,
  restrictTo("farmer"),
  asyncHandler(getMyListings),
);
router.get("/:id", protect, asyncHandler(getListingById));

export default router;
