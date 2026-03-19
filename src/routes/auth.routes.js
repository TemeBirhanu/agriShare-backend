import express from "express";
import {
  register,
  login,
  logout,
  verifyInvestorEmailOtp,
  resendInvestorEmailOtp,
} from "../controllers/auth.controller.js";

const router = express.Router();

// Public routes
router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.post("/verify-email-otp", verifyInvestorEmailOtp);
router.post("/resend-email-otp", resendInvestorEmailOtp);

export default router;
