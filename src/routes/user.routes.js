import express from "express";
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { getAllUsers } from "../controllers/user.controller.js";

const router = express.Router();

router.get(
  "/me",
  protect,
  asyncHandler(async (req, res) => {
    res.json(
      new ApiResponse(
        200,
        { user: req.user },
        "Current user fetched successfully",
      ),
    );
  }),
);

// farmer-only route example
router.get(
  "/farmer/dashboard",
  protect,
  restrictTo("farmer"),
  asyncHandler(async (req, res) => {
    res.json(
      new ApiResponse(
        200,
        {
          message: "Welcome to Farmer Dashboard",
          userRole: req.user.role,
          canListAssets: true,
        },
        "Farmer dashboard data",
      ),
    );
  }),
);

// admin-only route
router.get(
  "/admin/users",
  protect,
  restrictTo("admin"),
  getAllUsers
);

export default router;
