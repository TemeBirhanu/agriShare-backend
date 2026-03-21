import express from "express";
const router = express.Router();
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import {
  createListing,
  getActiveListings,
  getMyListings,
  getListingById,
} from "../controllers/listing.controller.js";
import {
  createListingUpdate,
  getListingUpdates,
  updateListingUpdate,
  deleteListingUpdate,
} from "../controllers/listingUpdate.controller.js";
import { upload } from "../middlewares/upload.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

router.post("/", protect, restrictTo("farmer"), createListing);
router.get("/active", protect, asyncHandler(getActiveListings));
router.get(
  "/my-listings",
  protect,
  restrictTo("farmer"),
  asyncHandler(getMyListings),
);
router.post(
  "/:id/updates",
  protect,
  restrictTo("farmer"),
  upload.array("images", 3),
  createListingUpdate,
);
router.get("/:id/updates", protect, getListingUpdates);
router.patch(
  "/:id/updates/:updateId",
  protect,
  restrictTo("farmer"),
  upload.array("images", 3),
  updateListingUpdate,
);
router.delete(
  "/:id/updates/:updateId",
  protect,
  restrictTo("farmer"),
  deleteListingUpdate,
);
router.get("/:id", protect, asyncHandler(getListingById));

export default router;
