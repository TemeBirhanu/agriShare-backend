const express = require("express");
const router = express.Router();

const { protect, restrictTo } = require("../middlewares/auth.middleware");
const asyncHandler = require("../utils/asyncHandler").asyncHandler;
const { ApiResponse } = require("../utils/ApiResponse");

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

// admin-only route example
router.get(
  "/admin/users",
  protect,
  restrictTo("admin"),
  asyncHandler(async (req, res) => {
    res.json(
      new ApiResponse(
        200,
        { message: "Admin panel - list of users (placeholder)" },
        "Admin access granted",
      ),
    );
  }),
);

module.exports = router;
