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
} from "../controllers/investment.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getInvestmentContracts } from "../controllers/contract.controller.js";

router.post(
  "/buy",
  protect,
  restrictTo("investor"),
  requireVerifiedInvestor,
  asyncHandler(buyInvestmentShares),
);

router.get("/contracts", protect, getInvestmentContracts);

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

// Farmer: all investments in my listings
router.get(
  "/farmer/my-investments",
  protect,
  restrictTo("farmer"),
  getFarmerInvestments,
);

export default router;
