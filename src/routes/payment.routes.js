import express from "express";
import { protect, restrictTo } from "../middlewares/auth.middleware.js";
import {
  initiateDeposit,
  verifyDepositByTxRef,
  handleChapaWebhook,
  requestWithdrawal,
  getMyPaymentTransactions,
  getAdminPaymentTransactions,
} from "../controllers/payment.controller.js";

const router = express.Router();

router.post("/deposits/initiate", protect, initiateDeposit);
router.get("/deposits/verify/:txRef", protect, verifyDepositByTxRef);
router.post("/webhook/chapa", handleChapaWebhook);
router.post("/withdrawals/request", protect, requestWithdrawal);
router.get("/me/transactions", protect, getMyPaymentTransactions);
router.get(
  "/admin/transactions",
  protect,
  restrictTo("admin"),
  getAdminPaymentTransactions,
);

export default router;
