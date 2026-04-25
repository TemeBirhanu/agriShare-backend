import mongoose from "mongoose";
import PaymentTransaction from "../models/PaymentTransaction.js";
import User from "../models/User.js";
import CreditTransaction from "../models/CreditTransaction.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  generatePaymentTxRef,
  initializeChapaDeposit,
  initiateChapaBankWithdrawal,
  verifyChapaTransfer,
  verifyChapaTransaction,
  verifyChapaWebhookSignature,
} from "../services/payment.service.js";
import { createNotificationSafe } from "../services/notification.service.js";

const roundBirr = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const parsePositiveNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return roundBirr(parsed);
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const isTransactionNotSupportedError = (error) =>
  error?.code === 20 ||
  error?.codeName === "IllegalOperation" ||
  String(error?.message || "").includes(
    "Transaction numbers are only allowed on a replica set member or mongos",
  );

const withSession = (session) => (session ? { session } : {});

const settleDepositSuccess = async (payment, providerData, session = null) => {
  const paymentQuery = PaymentTransaction.findById(payment._id);
  const paymentDoc = session
    ? await paymentQuery.session(session)
    : await paymentQuery;

  if (!paymentDoc) {
    throw new ApiError(404, "Payment transaction not found");
  }

  if (paymentDoc.status === "successful") {
    const user = await User.findById(paymentDoc.user)
      .select("walletBalance")
      .lean();

    return {
      payment: paymentDoc,
      walletBalance: roundBirr(user?.walletBalance || 0),
      alreadySettled: true,
    };
  }

  const updatedUser = await User.findByIdAndUpdate(
    paymentDoc.user,
    { $inc: { walletBalance: paymentDoc.amountBirr } },
    { new: true, ...withSession(session) },
  );

  if (!updatedUser) {
    throw new ApiError(404, "User account not found for payment settlement");
  }

  await CreditTransaction.create(
    [
      {
        user: paymentDoc.user,
        type: "deposit",
        amount: paymentDoc.amountBirr,
        balanceAfter: roundBirr(updatedUser.walletBalance),
        description: `Wallet deposit via ${paymentDoc.provider.toUpperCase()}`,
        referenceId: paymentDoc._id,
        referenceModel: "PaymentTransaction",
      },
    ],
    withSession(session),
  );

  paymentDoc.status = "successful";
  paymentDoc.settledAt = new Date();
  paymentDoc.failureReason = null;
  paymentDoc.providerReference =
    providerData?.providerReference || paymentDoc.providerReference;
  paymentDoc.metadata = {
    ...(paymentDoc.metadata || {}),
    verification: providerData?.response || null,
  };

  await paymentDoc.save(withSession(session));

  await createNotificationSafe({
    recipient: paymentDoc.user,
    type: "wallet_deposit_success",
    title: "Wallet Deposit Successful",
    message: `${paymentDoc.amountBirr} ETB has been added to your wallet.`,
    referenceId: paymentDoc._id,
    referenceModel: "PaymentTransaction",
  });

  return {
    payment: paymentDoc,
    walletBalance: roundBirr(updatedUser.walletBalance),
    alreadySettled: false,
  };
};

export const initiateDeposit = asyncHandler(async (req, res) => {
  const amountBirr = parsePositiveNumber(req.body.amountBirr);
  if (!amountBirr) {
    throw new ApiError(400, "amountBirr must be a positive number");
  }

  const txRef = generatePaymentTxRef("deposit", req.user._id);

  const payment = await PaymentTransaction.create({
    user: req.user._id,
    type: "deposit",
    provider: "chapa",
    txRef,
    status: "pending",
    amountBirr,
    currency: "ETB",
    metadata: {
      initiatedBy: "api",
    },
  });

  try {
    const initResult = await initializeChapaDeposit({
      amountBirr,
      txRef,
      user: req.user,
      callbackUrl: req.body.callbackUrl,
      returnUrl: req.body.returnUrl,
    });

    payment.checkoutUrl = initResult.checkoutUrl;
    payment.providerReference = initResult.providerReference || null;
    payment.metadata = {
      ...(payment.metadata || {}),
      initializeResponse: initResult.response,
    };
    await payment.save();

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          payment,
          checkoutUrl: payment.checkoutUrl,
        },
        "Deposit initiated successfully",
      ),
    );
  } catch (error) {
    payment.status = "failed";
    payment.failureReason = error.message;
    await payment.save();
    throw error;
  }
});

export const verifyDepositByTxRef = asyncHandler(async (req, res) => {
  const { txRef } = req.params;

  const payment = await PaymentTransaction.findOne({
    txRef,
    type: "deposit",
  });

  if (!payment) {
    throw new ApiError(404, "Deposit transaction not found");
  }

  if (
    req.user.role !== "admin" &&
    payment.user.toString() !== req.user._id.toString()
  ) {
    throw new ApiError(403, "You can only verify your own deposit transaction");
  }

  const verification = await verifyChapaTransaction(txRef);

  if (!verification.isSuccessful) {
    if (payment.status !== "successful") {
      payment.status = "failed";
      payment.failureReason =
        verification.failureReason || "Deposit not completed";
      payment.metadata = {
        ...(payment.metadata || {}),
        verification: verification.response,
      };
      await payment.save();
    }

    throw new ApiError(400, "Deposit is not successful yet");
  }

  const session = await mongoose.startSession();
  let settlement = null;

  try {
    try {
      await session.withTransaction(async () => {
        settlement = await settleDepositSuccess(payment, verification, session);
      });
    } catch (error) {
      if (!isTransactionNotSupportedError(error)) {
        throw error;
      }
      settlement = await settleDepositSuccess(payment, verification, null);
    }
  } finally {
    await session.endSession();
  }

  return res.json(
    new ApiResponse(
      200,
      {
        payment: settlement.payment,
        walletBalance: settlement.walletBalance,
        alreadySettled: settlement.alreadySettled,
      },
      "Deposit verified successfully",
    ),
  );
});

export const handleChapaWebhook = asyncHandler(async (req, res) => {
  if (!verifyChapaWebhookSignature(req)) {
    throw new ApiError(401, "Invalid webhook signature");
  }

  const txRef =
    req.body?.tx_ref ||
    req.body?.trx_ref ||
    req.body?.data?.tx_ref ||
    req.body?.data?.trx_ref;

  if (!txRef) {
    throw new ApiError(400, "tx_ref is required in webhook payload");
  }

  const payment = await PaymentTransaction.findOne({
    txRef,
    type: "deposit",
  });

  if (!payment) {
    return res.json(new ApiResponse(200, { received: true }, "Ignored"));
  }

  const verification = await verifyChapaTransaction(txRef);

  if (!verification.isSuccessful) {
    if (payment.status !== "successful") {
      payment.status = "failed";
      payment.failureReason =
        verification.failureReason || "Deposit not completed";
      payment.metadata = {
        ...(payment.metadata || {}),
        webhookPayload: req.body,
        verification: verification.response,
      };
      await payment.save();
    }

    return res.json(
      new ApiResponse(
        200,
        { received: true, settled: false },
        "Webhook received",
      ),
    );
  }

  const session = await mongoose.startSession();
  try {
    try {
      await session.withTransaction(async () => {
        await settleDepositSuccess(payment, verification, session);
      });
    } catch (error) {
      if (!isTransactionNotSupportedError(error)) {
        throw error;
      }
      await settleDepositSuccess(payment, verification, null);
    }
  } finally {
    await session.endSession();
  }

  return res.json(
    new ApiResponse(
      200,
      { received: true, settled: true },
      "Webhook processed",
    ),
  );
});

export const requestWithdrawal = asyncHandler(async (req, res) => {
  const amountBirr = parsePositiveNumber(req.body.amountBirr);
  if (!amountBirr) {
    throw new ApiError(400, "amountBirr must be a positive number");
  }

  const accountName = String(req.body.accountName || "").trim();
  const accountNumber = String(req.body.accountNumber || "").trim();
  const bankCode = String(req.body.bankCode || "").trim();
  const bankName = String(req.body.bankName || "").trim() || null;

  if (!accountName || !accountNumber || !bankCode) {
    throw new ApiError(
      400,
      "accountName, accountNumber, and bankCode are required for bank withdrawals",
    );
  }

  const txRef = generatePaymentTxRef("withdrawal", req.user._id);
  const updatedUser = await User.findOneAndUpdate(
    {
      _id: req.user._id,
      walletBalance: { $gte: amountBirr },
    },
    {
      $inc: { walletBalance: -amountBirr },
    },
    { new: true },
  );

  if (!updatedUser) {
    throw new ApiError(400, "Insufficient wallet balance for withdrawal");
  }

  const payment = await PaymentTransaction.create({
    user: req.user._id,
    type: "withdrawal",
    provider: "chapa",
    txRef,
    status: "processing",
    amountBirr,
    currency: "ETB",
    bankAccount: {
      accountName,
      accountNumber,
      bankCode,
      bankName,
    },
    metadata: {
      initiatedBy: "api",
    },
  });

  let result = null;

  try {
    const transferResult = await initiateChapaBankWithdrawal({
      txRef,
      amountBirr,
      accountName,
      accountNumber,
      bankCode,
      bankName,
      narration: req.body.narration,
      user: req.user,
    });

    payment.providerReference = transferResult.providerReference || null;
    payment.metadata = {
      ...(payment.metadata || {}),
      transferResponse: transferResult.response,
    };

    let finalTransferState = transferResult;

    if (transferResult.isProcessing) {
      const verifiedTransfer = await verifyChapaTransfer(txRef);
      payment.metadata = {
        ...(payment.metadata || {}),
        transferVerifyResponse: verifiedTransfer.response,
      };

      finalTransferState = {
        ...transferResult,
        ...verifiedTransfer,
      };
    }

    if (!finalTransferState.isSuccessful && !finalTransferState.isProcessing) {
      throw new ApiError(
        502,
        finalTransferState.failureReason ||
          "Withdrawal provider request failed",
      );
    }

    if (finalTransferState.isSuccessful) {
      payment.status = "successful";
      payment.failureReason = null;
      payment.settledAt = new Date();
      await payment.save();

      await CreditTransaction.create({
        user: req.user._id,
        type: "withdrawal",
        amount: -amountBirr,
        balanceAfter: roundBirr(updatedUser.walletBalance),
        description: `Wallet withdrawal to bank (${bankCode})`,
        referenceId: payment._id,
        referenceModel: "PaymentTransaction",
      });

      await createNotificationSafe({
        recipient: req.user._id,
        type: "wallet_withdrawal_success",
        title: "Withdrawal Successful",
        message: `${amountBirr} ETB was withdrawn to your bank account.`,
        referenceId: payment._id,
        referenceModel: "PaymentTransaction",
      });
    } else {
      payment.status = "processing";
      payment.failureReason = null;
      await payment.save();
    }

    result = {
      payment,
      walletBalance: roundBirr(updatedUser.walletBalance),
      transferStatus:
        finalTransferState.transferStatus || finalTransferState.status,
    };
  } catch (error) {
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { walletBalance: amountBirr },
    });

    payment.status = "failed";
    payment.failureReason = error.message;
    payment.metadata = {
      ...(payment.metadata || {}),
      failedAt: new Date(),
    };
    await payment.save();

    await createNotificationSafe({
      recipient: req.user._id,
      type: "wallet_withdrawal_failed",
      title: "Withdrawal Failed",
      message:
        "Withdrawal request failed and your wallet balance was restored.",
      referenceId: payment._id,
      referenceModel: "PaymentTransaction",
    });

    throw error;
  }

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        payment: result.payment,
        walletBalance: result.walletBalance,
        transferStatus: result.transferStatus,
      },
      "Withdrawal processed successfully",
    ),
  );
});

export const getMyPaymentTransactions = asyncHandler(async (req, res) => {
  const page = parsePositiveInt(req.query.page, 1);
  const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
  const skip = (page - 1) * limit;

  const type = String(req.query.type || "all")
    .trim()
    .toLowerCase();
  const status = String(req.query.status || "all")
    .trim()
    .toLowerCase();

  const query = { user: req.user._id };

  if (["deposit", "withdrawal"].includes(type)) {
    query.type = type;
  }

  if (
    ["pending", "processing", "successful", "failed", "cancelled"].includes(
      status,
    )
  ) {
    query.status = status;
  }

  const [total, transactions] = await Promise.all([
    PaymentTransaction.countDocuments(query),
    PaymentTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
  ]);

  return res.json(
    new ApiResponse(
      200,
      {
        transactions,
        total,
        page,
        limit,
        hasNextPage: skip + transactions.length < total,
      },
      "Payment transactions retrieved",
    ),
  );
});

export const getAdminPaymentTransactions = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    throw new ApiError(403, "Only admins can view payment transactions");
  }

  const page = parsePositiveInt(req.query.page, 1);
  const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
  const skip = (page - 1) * limit;

  const type = String(req.query.type || "all")
    .trim()
    .toLowerCase();
  const status = String(req.query.status || "all")
    .trim()
    .toLowerCase();

  const query = {};

  if (["deposit", "withdrawal"].includes(type)) {
    query.type = type;
  }

  if (
    ["pending", "processing", "successful", "failed", "cancelled"].includes(
      status,
    )
  ) {
    query.status = status;
  }

  const [total, transactions] = await Promise.all([
    PaymentTransaction.countDocuments(query),
    PaymentTransaction.find(query)
      .populate("user", "firstName lastName email phone role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
  ]);

  return res.json(
    new ApiResponse(
      200,
      {
        transactions,
        total,
        page,
        limit,
        hasNextPage: skip + transactions.length < total,
      },
      "Admin payment transactions retrieved",
    ),
  );
});
