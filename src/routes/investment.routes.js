import express from "express";
const router = express.Router();
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
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
  asyncHandler(buyInvestmentShares),
);

router.get("/contracts", protect, getInvestmentContracts);

// My active investments (investor only)
router.get(
  "/my-active",
  protect,
  restrictTo("investor"),
  getMyActiveInvestments,
);

// My investment history (completed)
router.get("/my-history", protect, restrictTo("investor"), getMyHistory);

// Farmer: all investments in my listings
router.get(
  "/farmer/my-investments",
  protect,
  restrictTo("farmer"),
  getFarmerInvestments,
);

export default router;
