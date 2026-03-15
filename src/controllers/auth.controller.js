import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import User from "../models/User.js";
import { generateToken } from "../utils/jwt.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  grantSignupBonus,
  grantMonthlyCredits,
} from "../services/agriCredits.service.js";

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
    $or: [{ email }, { phone }],
  });
  if (existingUser) {
    throw new ApiError(400, "Email or phone number already in use");
  }

  const user = await User.create({
    firstName,
    lastName,
    phone,
    email,
    password,
    role: selectedRole,
    region: selectedRole === "farmer" ? region?.trim() : undefined,
    zone: selectedRole === "farmer" ? zone?.trim() : undefined,
    woreda: selectedRole === "farmer" ? woreda?.trim() : undefined,
    kebele: selectedRole === "farmer" ? kebele?.trim() : undefined,
    bio: bio?.trim() || undefined,
    verificationStatus: selectedRole === "farmer" ? "unverified" : "verified",
    isVerified: selectedRole !== "farmer",
  });

  // Grant signup + monthly AgriCredits bonus
  if (user.role === "farmer") {
    await grantSignupBonus(user._id);
    await grantMonthlyCredits(user._id);
  }

  const token = generateToken(user);

  const userData = {
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
    verificationStatus: user.verificationStatus,
    verificationRejectionReason: user.verificationRejectionReason,
  };

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { token, user: userData },
        "User registered successfully",
      ),
    );
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    throw new ApiError(401, "Invalid credentials");
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, "Invalid credentials");
  }

  const token = generateToken(user);

  const userData = {
    id: user._id,
    fullName: `${user.firstName} ${user.lastName}`,
    email: user.email,
    phone: user.phone,
    role: user.role,
    verificationStatus: user.verificationStatus,
    verificationRejectionReason: user.verificationRejectionReason,
  };

  // grant monthly credits if eligible (call on login to ensure regular check)
  if (user.role === "farmer") {
    await grantMonthlyCredits(user._id);
  }

  return res.json(
    new ApiResponse(200, { token, user: userData }, "Login successful"),
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
