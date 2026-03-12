import express from "express";
const router = express.Router();
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getBalance } from "../services/agriCredits.service.js";
import CreditTransaction from "../models/CreditTransaction.js";
import { ApiResponse } from "../utils/ApiResponse.js";

router.get(
  "/balance",
  protect,
  asyncHandler(async (req, res) => {
    const data = await getBalance(req.user._id);
    res.json(new ApiResponse(200, data, "AgriCredits balance"));
  }),
);

router.get(
  "/history",
  protect,
  asyncHandler(async (req, res) => {
    const transactions = await CreditTransaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(new ApiResponse(200, { transactions }, "Credit history"));
  }),
);

// TODO: POST /buy (purchase bundle) – later with payment gateway

export default router;
