import express from "express";
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import {
  getAdminDashboardOverview,
  getVerificationQueue,
  getAssetQueue,
  getListingsRiskQueue,
  getInvestmentAnalytics,
  getDistributionAnalytics,
  getCreditsAnalytics,
  triggerRefundForListingOperation,
} from "../controllers/admin.controller.js";

const router = express.Router();

router.use(protect, restrictTo("admin"));

router.get("/dashboard/overview", getAdminDashboardOverview);

router.get("/queues/verifications", getVerificationQueue);
router.get("/queues/assets", getAssetQueue);
router.get("/queues/listings-risk", getListingsRiskQueue);

router.get("/analytics/investments", getInvestmentAnalytics);
router.get("/analytics/distributions", getDistributionAnalytics);
router.get("/analytics/credits", getCreditsAnalytics);

router.post("/operations/refunds/:listingId", triggerRefundForListingOperation);

export default router;
