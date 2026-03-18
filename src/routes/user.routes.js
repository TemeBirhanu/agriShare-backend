import express from "express";
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import {
  getAllUsers,
  getFarmerDashboard,
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
  deactivateMyAccount,
  getUserById,
  updateUserByAdmin,
  setUserActiveStatus,
} from "../controllers/user.controller.js";

const router = express.Router();

router.get("/me", protect, getMyProfile);
router.patch("/me", protect, updateMyProfile);
router.patch("/me/password", protect, changeMyPassword);
router.delete("/me", protect, deactivateMyAccount);

// farmer-only route
router.get(
  "/farmer/dashboard",
  protect,
  restrictTo("farmer"),
  getFarmerDashboard,
);

// admin-only route
router.get("/admin/users", protect, restrictTo("admin"), getAllUsers);

router.get("/admin/users/:id", protect, restrictTo("admin"), getUserById);

router.patch(
  "/admin/users/:id",
  protect,
  restrictTo("admin"),
  updateUserByAdmin,
);

router.patch(
  "/admin/users/:id/status",
  protect,
  restrictTo("admin"),
  setUserActiveStatus,
);

export default router;
