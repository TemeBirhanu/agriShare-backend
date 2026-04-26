import express from "express";
const router = express.Router();
import {
  protect,
  restrictTo,
  requireVerifiedInvestor,
} from "../middlewares/auth.middleware.js";
import {
  buyInvestmentShares,
  getMyActiveInvestments,
  getMyHistory,
  getFarmerInvestments,
  submitInvestorRefundRequest,
  getMyRefundRequests,
  getPendingInvestorRefundRequestsForAdmin,
  reviewInvestorRefundRequestByAdmin,
} from "../controllers/investment.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getInvestmentContracts } from "../controllers/contract.controller.js";

router.post(
  "/buy/:listingId",
  protect,
  restrictTo("investor"),
  requireVerifiedInvestor,
  asyncHandler(buyInvestmentShares),
);

router.get("/contracts/:listingId", protect, getInvestmentContracts);

// My active investments (investor only)
router.get(
  "/my-active",
  protect,
  restrictTo("investor"),
  requireVerifiedInvestor,
  getMyActiveInvestments,
);

// My investment history (completed)
router.get(
  "/my-history",
  protect,
  restrictTo("investor"),
  requireVerifiedInvestor,
  getMyHistory,
);

router.post(
  "/refund-requests/:listingId",
  protect,
  restrictTo("investor"),
  requireVerifiedInvestor,
  submitInvestorRefundRequest,
);

router.get(
  "/my-refund-requests",
  protect,
  restrictTo("investor"),
  requireVerifiedInvestor,
  getMyRefundRequests,
);

// Farmer: all investments in my listings
router.get(
  "/farmer/my-investments",
  protect,
  restrictTo("farmer"),
  getFarmerInvestments,
);

router.get(
  "/admin/refund-requests",
  protect,
  restrictTo("admin"),
  getPendingInvestorRefundRequestsForAdmin,
);

router.patch(
  "/admin/refund-requests/:id/review",
  protect,
  restrictTo("admin"),
  reviewInvestorRefundRequestByAdmin,
);

export default router;
