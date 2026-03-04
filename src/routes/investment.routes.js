import express from "express";
const router = express.Router();
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import { buyInvestmentShares } from "../controllers/investment.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

router.post(
  "/buy",
  protect,
  restrictTo("investor"),
  asyncHandler(buyInvestmentShares),
);

export default router;
