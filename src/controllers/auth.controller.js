import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import User from "../models/User.js";
import { generateToken } from "../utils/jwt.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendInvestorVerificationOtpEmail } from "../services/email.service.js";
import {
  grantSignupBonus,
  grantMonthlyCredits,
} from "../services/agriCredits.service.js";
import {
  OTP_EXPIRY_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  generateNumericOtp,
  getOtpExpiryDate,
  hashEmailOtp,
} from "../utils/otp.js";

const buildUserData = (user) => ({
  id: user._id,
  email: user.email,
  phone: user.phone,
  role: user.role,
  fullName: `${user.firstName} ${user.lastName}`,
  region: user.region,
  zone: user.zone,
  woreda: user.woreda,
  kebele: user.kebele,
  bio: user.bio,
  isActive: user.isActive,
  deactivatedAt: user.deactivatedAt,
  isVerified: user.isVerified,
  verificationStatus: user.verificationStatus,
  verificationRejectionReason: user.verificationRejectionReason,
});

const issueInvestorOtp = async (user) => {
  const otpCode = generateNumericOtp();

  user.emailVerificationCodeHash = hashEmailOtp(user.email, otpCode);
  user.emailVerificationCodeExpiresAt = getOtpExpiryDate();
  user.emailVerificationLastSentAt = new Date();
  user.emailVerificationAttemptCount = 0;
  await user.save();

  await sendInvestorVerificationOtpEmail({
    to: user.email,
    firstName: user.firstName,
    otpCode,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  });
};

export const register = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    phone,
    email,
    password,
    role,
    region,
    zone,
    woreda,
    kebele,
    bio,
  } = req.body;

  const selectedRole = String(role || "investor").toLowerCase();

  if (!firstName || !lastName || !phone || !email || !password) {
    throw new ApiError(
      400,
      "First name, last name, phone, email and password are required",
    );
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedPhone = String(phone).trim();

  if (!["farmer", "investor", "admin"].includes(selectedRole)) {
    throw new ApiError(400, "Invalid role provided");
  }

  const isBlank = (value) =>
    value === undefined || value === null || String(value).trim() === "";

  if (
    selectedRole === "farmer" &&
    [region, zone, woreda, kebele].some(isBlank)
  ) {
    throw new ApiError(
      400,
      "Region, zone, woreda and kebele are required for farmer accounts",
    );
  }

  const existingUser = await User.findOne({
    $or: [{ email: normalizedEmail }, { phone: normalizedPhone }],
  });
  if (existingUser) {
    throw new ApiError(400, "Email or phone number already in use");
  }

  const isFarmer = selectedRole === "farmer";
  const isInvestor = selectedRole === "investor";
  const isAdmin = selectedRole === "admin";

  const user = await User.create({
    firstName,
    lastName,
    phone: normalizedPhone,
    email: normalizedEmail,
    password,
    role: selectedRole,
    region: selectedRole === "farmer" ? region?.trim() : undefined,
    zone: selectedRole === "farmer" ? zone?.trim() : undefined,
    woreda: selectedRole === "farmer" ? woreda?.trim() : undefined,
    kebele: selectedRole === "farmer" ? kebele?.trim() : undefined,
    bio: bio?.trim() || undefined,
    verificationStatus: isAdmin ? "verified" : "unverified",
    isVerified: isAdmin,
  });

  // Grant signup + monthly AgriCredits bonus
  if (isFarmer) {
    await grantSignupBonus(user._id);
    await grantMonthlyCredits(user._id);
  }

  if (isInvestor) {
    try {
      await issueInvestorOtp(user);
    } catch (error) {
      console.error("Failed to send investor verification OTP email:", error);
      await User.findByIdAndDelete(user._id).catch(() => null);
      throw new ApiError(
        500,
        "Failed to send verification email. Please try registering again",
      );
    }

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          requiresEmailVerification: true,
          email: user.email,
          user: buildUserData(user),
        },
        "Investor registered successfully. Verify your email to continue",
      ),
    );
  }

  const token = generateToken(user);

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { token, user: buildUserData(user) },
        "User registered successfully",
      ),
    );
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const user = await User.findOne({ email: normalizedEmail }).select(
    "+password",
  );
  if (!user) {
    throw new ApiError(401, "Invalid credentials");
  }

  if (!user.isActive) {
    throw new ApiError(403, "Account is inactive. Please contact support");
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, "Invalid credentials");
  }

  if (
    user.role === "investor" &&
    (!user.isVerified || user.verificationStatus !== "verified")
  ) {
    throw new ApiError(
      403,
      "Email not verified. Please verify your email with OTP before login",
    );
  }

  const token = generateToken(user);

  // grant monthly credits if eligible (call on login to ensure regular check)
  if (user.role === "farmer") {
    await grantMonthlyCredits(user._id);
  }

  return res.json(
    new ApiResponse(
      200,
      { token, user: buildUserData(user) },
      "Login successful",
    ),
  );
});

export const verifyInvestorEmailOtp = asyncHandler(async (req, res) => {
  const { email, otpCode } = req.body;

  if (!email || !otpCode) {
    throw new ApiError(400, "Email and OTP code are required");
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedOtpCode = String(otpCode).trim();

  if (!/^\d{6}$/.test(normalizedOtpCode)) {
    throw new ApiError(400, "OTP code must be a 6-digit number");
  }

  const user = await User.findOne({
    email: normalizedEmail,
    role: "investor",
  }).select("+emailVerificationCodeHash");

  if (!user) {
    throw new ApiError(404, "Investor account not found");
  }

  if (!user.isActive) {
    throw new ApiError(403, "Account is inactive. Please contact support");
  }

  if (user.isVerified && user.verificationStatus === "verified") {
    throw new ApiError(400, "Investor email is already verified");
  }

  if (!user.emailVerificationCodeHash || !user.emailVerificationCodeExpiresAt) {
    throw new ApiError(
      400,
      "No active verification code. Please request a new OTP",
    );
  }

  if (new Date(user.emailVerificationCodeExpiresAt).getTime() < Date.now()) {
    throw new ApiError(
      400,
      "Verification code has expired. Please request a new OTP",
    );
  }

  if ((user.emailVerificationAttemptCount || 0) >= OTP_MAX_ATTEMPTS) {
    throw new ApiError(
      429,
      "Too many failed attempts. Please request a new OTP",
    );
  }

  const incomingCodeHash = hashEmailOtp(user.email, normalizedOtpCode);
  if (incomingCodeHash !== user.emailVerificationCodeHash) {
    user.emailVerificationAttemptCount =
      (user.emailVerificationAttemptCount || 0) + 1;
    await user.save();

    throw new ApiError(400, "Invalid verification code");
  }

  user.isVerified = true;
  user.verificationStatus = "verified";
  user.verificationRejectionReason = undefined;
  user.emailVerificationCodeHash = null;
  user.emailVerificationCodeExpiresAt = null;
  user.emailVerificationLastSentAt = null;
  user.emailVerificationAttemptCount = 0;
  await user.save();

  const token = generateToken(user);

  return res.json(
    new ApiResponse(
      200,
      { token, user: buildUserData(user) },
      "Email verified successfully",
    ),
  );
});

export const resendInvestorEmailOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ApiError(400, "Email is required");
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await User.findOne({
    email: normalizedEmail,
    role: "investor",
  }).select("+emailVerificationCodeHash");

  if (!user) {
    throw new ApiError(404, "Investor account not found");
  }

  if (!user.isActive) {
    throw new ApiError(403, "Account is inactive. Please contact support");
  }

  if (user.isVerified && user.verificationStatus === "verified") {
    throw new ApiError(400, "Investor email is already verified");
  }

  const lastSentAt = user.emailVerificationLastSentAt
    ? new Date(user.emailVerificationLastSentAt).getTime()
    : null;

  if (lastSentAt && Date.now() - lastSentAt < OTP_RESEND_COOLDOWN_MS) {
    const waitSeconds = Math.ceil(
      (OTP_RESEND_COOLDOWN_MS - (Date.now() - lastSentAt)) / 1000,
    );

    throw new ApiError(
      429,
      `Please wait ${waitSeconds} seconds before requesting another OTP`,
    );
  }

  const previousOtpState = {
    emailVerificationCodeHash: user.emailVerificationCodeHash,
    emailVerificationCodeExpiresAt: user.emailVerificationCodeExpiresAt,
    emailVerificationLastSentAt: user.emailVerificationLastSentAt,
    emailVerificationAttemptCount: user.emailVerificationAttemptCount,
  };

  try {
    await issueInvestorOtp(user);
  } catch (error) {
    user.emailVerificationCodeHash = previousOtpState.emailVerificationCodeHash;
    user.emailVerificationCodeExpiresAt =
      previousOtpState.emailVerificationCodeExpiresAt;
    user.emailVerificationLastSentAt =
      previousOtpState.emailVerificationLastSentAt;
    user.emailVerificationAttemptCount =
      previousOtpState.emailVerificationAttemptCount;
    await user.save().catch(() => null);

    throw new ApiError(
      500,
      "Failed to send verification email. Please try again",
    );
  }

  return res.json(
    new ApiResponse(
      200,
      {
        email: user.email,
        expiresInMinutes: OTP_EXPIRY_MINUTES,
        resendAvailableInSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
      },
      "Verification code sent successfully",
    ),
  );
});

export const logout = asyncHandler(async (_req, res) => {
  // Clear common cookie names if JWT is ever stored in cookies.
  res.clearCookie("token");
  res.clearCookie("jwt");
  res.clearCookie("accessToken");

  return res.status(200).json(new ApiResponse(200, {}, "Logout successful"));
});

// module.exports = { register, login };
