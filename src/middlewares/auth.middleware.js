import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getAuthCookieName } from "../utils/jwt.js";

const protect = asyncHandler(async (req, res, next) => {
  let token;

  const cookieToken = req.cookies?.[getAuthCookieName()];
  if (cookieToken) {
    token = cookieToken;
  }

  if (
    !token &&
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    throw new ApiError(401, "Not authorized - no token provided");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      throw new ApiError(401, "User not found");
    }

    if (!user.isActive) {
      throw new ApiError(403, "Account is inactive. Please contact support");
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error.name === "TokenExpiredError") {
      throw new ApiError(401, "Token has expired");
    }
    throw new ApiError(401, "Not authorized - invalid token");
  }
});

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ApiError(
        403,
        `Access denied. Only ${roles.join(", ")} can access this resource`,
      );
    }
    next();
  };
};

const requireVerifiedInvestor = (req, res, next) => {
  if (!req.user || req.user.role !== "investor") {
    throw new ApiError(403, "Only investors can access this resource");
  }

  if (!req.user.isActive) {
    throw new ApiError(403, "Account is inactive. Please contact support");
  }

  if (!req.user.isVerified || req.user.verificationStatus !== "verified") {
    throw new ApiError(
      403,
      "Investor email is not verified. Please verify before continuing",
    );
  }

  next();
};

export { protect, restrictTo, requireVerifiedInvestor };
