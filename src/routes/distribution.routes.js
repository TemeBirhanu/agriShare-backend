import express from "express";
const router = express.Router();
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import { distributeProfits } from "../controllers/distribution.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

router.post(
  "/",
  protect,
  restrictTo("farmer"),
  asyncHandler(distributeProfits),
);

export default router;
