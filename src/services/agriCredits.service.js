import User from "../models/User.js";
import CreditTransaction from "../models/CreditTransaction.js";
import { ApiError } from "../utils/ApiError.js";

const MONTHLY_FREE = 40;
const SIGNUP_BONUS = 60;
const MAX_ROLLOVER = 120;

// Grant monthly credits (call via cron or on login)
export async function grantMonthlyCredits(userId) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  const now = new Date();
  let monthsDiff = 0;

  // First-time farmers should get only the current month's free credits.
  if (!user.lastMonthlyCreditReset) {
    monthsDiff = 1;
  } else {
    const lastReset = user.lastMonthlyCreditReset;
    monthsDiff =
      (now.getFullYear() - lastReset.getFullYear()) * 12 +
      (now.getMonth() - lastReset.getMonth());
  }

  if (monthsDiff <= 0) return { granted: 0 }; // already granted this month

  let toGrant = MONTHLY_FREE * monthsDiff;
  let newBalance = user.agriCreditsBalance + toGrant;

  // Cap rollover
  if (newBalance > MAX_ROLLOVER) {
    newBalance = MAX_ROLLOVER;
    toGrant = MAX_ROLLOVER - user.agriCreditsBalance;
  }

  user.lastMonthlyCreditReset = now;

  // If user is already at cap, mark the reset and skip zero-amount transaction.
  if (toGrant <= 0) {
    await user.save();
    return { granted: 0, newBalance: user.agriCreditsBalance };
  }

  user.agriCreditsBalance = newBalance;
  await user.save();

  // Log transaction
  await CreditTransaction.create({
    user: user._id,
    type: "monthly_reset",
    amount: toGrant,
    balanceAfter: newBalance,
    description: `Monthly reset (${MONTHLY_FREE} per month)`,
  });

  return { granted: toGrant, newBalance };
}

// Grant signup bonus (call once after registration)
export async function grantSignupBonus(userId) {
  const user = await User.findById(userId);
  if (!user || user.agriCreditsBalance > 0) return; // already granted

  user.agriCreditsBalance = SIGNUP_BONUS;
  await user.save();

  await CreditTransaction.create({
    user: user._id,
    type: "signup_bonus",
    amount: SIGNUP_BONUS,
    balanceAfter: SIGNUP_BONUS,
    description: "Welcome bonus on registration",
  });
}

// Deduct credits for action
export async function deductCredits(
  userId,
  amount,
  type,
  description,
  referenceId = null,
  referenceModel = null,
) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  if (user.agriCreditsBalance < amount) {
    throw new ApiError(
      402,
      `Insufficient AgriCredits. You have ${user.agriCreditsBalance}, need ${amount}`,
    );
  }

  user.agriCreditsBalance -= amount;
  await user.save();

  const tx = await CreditTransaction.create({
    user: user._id,
    type,
    amount: -amount,
    balanceAfter: user.agriCreditsBalance,
    description,
    referenceId,
    referenceModel,
  });

  return { success: true, newBalance: user.agriCreditsBalance, tx };
}

// Add credits (purchase or refund)
export async function addCredits(
  userId,
  amount,
  type,
  description,
  referenceId = null,
  referenceModel = null,
) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  user.agriCreditsBalance += amount;
  await user.save();

  await CreditTransaction.create({
    user: user._id,
    type,
    amount,
    balanceAfter: user.agriCreditsBalance,
    description,
    referenceId,
    referenceModel,
  });

  return { success: true, newBalance: user.agriCreditsBalance };
}

// Get balance & next reset date
export async function getBalance(userId) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  const nextReset = new Date(user.lastMonthlyCreditReset || Date.now());
  nextReset.setMonth(nextReset.getMonth() + 1);
  nextReset.setDate(1); // first of next month

  return {
    balance: user.agriCreditsBalance,
    nextMonthlyReset: nextReset.toISOString().split("T")[0],
  };
}
