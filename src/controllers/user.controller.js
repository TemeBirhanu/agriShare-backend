import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import User from "../models/User.js";
import Asset from "../models/Asset.js";
import Listing from "../models/Listing.js";

const USER_SAFE_SELECT = "-password -emailVerificationCodeHash -__v";
const VALID_ROLES = ["farmer", "investor", "admin"];
const VALID_VERIFICATION_STATUSES = [
  "unverified",
  "pending",
  "verified",
  "rejected",
];
const LOCATION_FIELDS = ["region", "zone", "woreda", "kebele"];

const normalizeString = (value) =>
  typeof value === "string" ? value.trim() : value;

const normalizeOptionalString = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
};

const ensureAdmin = (user) => {
  if (!user || user.role !== "admin") {
    throw new ApiError(403, "Only admins can access this route");
  }
};

const ensureFarmer = (user) => {
  if (!user || user.role !== "farmer") {
    throw new ApiError(403, "Only farmers can access this route");
  }
};

const getLocationPayload = (body) => {
  const locationPayload = {};

  LOCATION_FIELDS.forEach((field) => {
    if (body[field] !== undefined) {
      locationPayload[field] = normalizeOptionalString(body[field]);
    }
  });

  return locationPayload;
};

export const getMyProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(USER_SAFE_SELECT);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res.json(
    new ApiResponse(200, { user }, "Current user fetched successfully"),
  );
});

// Get all users (Admin only)
export const getAllUsers = asyncHandler(async (req, res) => {
  ensureAdmin(req.user);

  const { role, status = "all", search, page = "1", limit = "20" } = req.query;

  const query = {};

  if (role) {
    const normalizedRole = String(role).trim().toLowerCase();
    if (!VALID_ROLES.includes(normalizedRole)) {
      throw new ApiError(400, "Invalid role filter");
    }
    query.role = normalizedRole;
  }

  const normalizedStatus = String(status).trim().toLowerCase();
  if (!["all", "active", "inactive"].includes(normalizedStatus)) {
    throw new ApiError(
      400,
      'Status must be one of "all", "active", or "inactive"',
    );
  }

  if (normalizedStatus === "active") {
    query.isActive = true;
  }

  if (normalizedStatus === "inactive") {
    query.isActive = false;
  }

  if (search !== undefined && String(search).trim() !== "") {
    const searchRegex = new RegExp(String(search).trim(), "i");
    query.$or = [
      { firstName: searchRegex },
      { lastName: searchRegex },
      { email: searchRegex },
      { phone: searchRegex },
    ];
  }

  const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
  const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const skip = (pageNumber - 1) * limitNumber;

  const total = await User.countDocuments(query);
  const users = await User.find(query)
    .select(USER_SAFE_SELECT)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNumber);

  const pages = Math.max(Math.ceil(total / limitNumber), 1);

  return res.json(
    new ApiResponse(
      200,
      {
        users,
        count: users.length,
        total,
        page: pageNumber,
        pages,
      },
      "All users retrieved successfully",
    ),
  );
});

export const updateMyProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const allowedFields = [
    "firstName",
    "lastName",
    "phone",
    "bio",
    "profilePicture",
  ];
  const updatePayload = {};

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updatePayload[field] = req.body[field];
    }
  });

  const locationPayload = getLocationPayload(req.body);
  const locationFieldsInRequest = Object.keys(locationPayload);

  if (req.user.role !== "farmer" && locationFieldsInRequest.length > 0) {
    throw new ApiError(
      400,
      "Only farmer accounts can update region, zone, woreda and kebele",
    );
  }

  Object.assign(updatePayload, locationPayload);

  if (Object.keys(updatePayload).length === 0) {
    throw new ApiError(400, "No updatable fields provided");
  }

  if (updatePayload.firstName !== undefined) {
    updatePayload.firstName = normalizeOptionalString(updatePayload.firstName);
    if (!updatePayload.firstName) {
      throw new ApiError(400, "First name cannot be empty");
    }
  }

  if (updatePayload.lastName !== undefined) {
    updatePayload.lastName = normalizeOptionalString(updatePayload.lastName);
    if (!updatePayload.lastName) {
      throw new ApiError(400, "Last name cannot be empty");
    }
  }

  if (updatePayload.phone !== undefined) {
    updatePayload.phone = normalizeOptionalString(updatePayload.phone);
    if (!updatePayload.phone) {
      throw new ApiError(400, "Phone number cannot be empty");
    }

    if (updatePayload.phone !== user.phone) {
      const existingPhoneUser = await User.findOne({
        phone: updatePayload.phone,
        _id: { $ne: user._id },
      });

      if (existingPhoneUser) {
        throw new ApiError(409, "Phone number already in use");
      }
    }
  }

  if (updatePayload.bio !== undefined) {
    updatePayload.bio = normalizeString(updatePayload.bio);
  }

  if (updatePayload.profilePicture !== undefined) {
    updatePayload.profilePicture = normalizeString(
      updatePayload.profilePicture,
    );
  }

  LOCATION_FIELDS.forEach((field) => {
    if (updatePayload[field] !== undefined && !updatePayload[field]) {
      throw new ApiError(400, `${field} cannot be empty`);
    }
  });

  Object.entries(updatePayload).forEach(([field, value]) => {
    user[field] = value;
  });

  await user.save();

  const updatedUser = await User.findById(user._id).select(USER_SAFE_SELECT);

  return res.json(
    new ApiResponse(200, { user: updatedUser }, "Profile updated successfully"),
  );
});

export const changeMyPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError(400, "Current password and new password are required");
  }

  if (String(newPassword).length < 6) {
    throw new ApiError(400, "New password must be at least 6 characters");
  }

  const user = await User.findById(req.user._id).select("+password");
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const isCurrentPasswordCorrect = await user.comparePassword(currentPassword);
  if (!isCurrentPasswordCorrect) {
    throw new ApiError(401, "Current password is incorrect");
  }

  user.password = String(newPassword);
  await user.save();

  return res.json(new ApiResponse(200, {}, "Password changed successfully"));
});

export const deactivateMyAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.role === "admin") {
    throw new ApiError(
      400,
      "Admin account cannot be deactivated via this endpoint",
    );
  }

  if (!user.isActive) {
    throw new ApiError(400, "Account is already inactive");
  }

  user.isActive = false;
  user.deactivatedAt = new Date();
  await user.save();

  return res.json(
    new ApiResponse(
      200,
      {
        id: user._id,
        isActive: user.isActive,
        deactivatedAt: user.deactivatedAt,
      },
      "Account deactivated successfully",
    ),
  );
});

export const getUserById = asyncHandler(async (req, res) => {
  ensureAdmin(req.user);

  const user = await User.findById(req.params.id).select(USER_SAFE_SELECT);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res.json(
    new ApiResponse(200, { user }, "User retrieved successfully"),
  );
});

export const updateUserByAdmin = asyncHandler(async (req, res) => {
  ensureAdmin(req.user);

  const user = await User.findById(req.params.id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const adminAllowedFields = new Set([
    "firstName",
    "lastName",
    "phone",
    "role",
    "bio",
    "profilePicture",
    "isVerified",
    "verificationStatus",
    "verificationRejectionReason",
    "region",
    "zone",
    "woreda",
    "kebele",
    "isActive",
  ]);

  const updates = {};
  Object.entries(req.body).forEach(([key, value]) => {
    if (adminAllowedFields.has(key) && value !== undefined) {
      updates[key] = value;
    }
  });

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No updatable fields provided");
  }

  if (updates.role !== undefined) {
    const normalizedRole = String(updates.role).trim().toLowerCase();
    if (!VALID_ROLES.includes(normalizedRole)) {
      throw new ApiError(400, "Invalid role value");
    }
    updates.role = normalizedRole;
  }

  if (updates.verificationStatus !== undefined) {
    const normalizedStatus = String(updates.verificationStatus)
      .trim()
      .toLowerCase();
    if (!VALID_VERIFICATION_STATUSES.includes(normalizedStatus)) {
      throw new ApiError(400, "Invalid verification status value");
    }
    updates.verificationStatus = normalizedStatus;
  }

  if (
    updates.isVerified !== undefined &&
    typeof updates.isVerified !== "boolean"
  ) {
    throw new ApiError(400, "isVerified must be boolean");
  }

  if (updates.isActive !== undefined && typeof updates.isActive !== "boolean") {
    throw new ApiError(400, "isActive must be boolean");
  }

  if (
    updates.isActive === false &&
    user._id.toString() === req.user._id.toString()
  ) {
    throw new ApiError(400, "Admin cannot deactivate their own account");
  }

  if (updates.firstName !== undefined) {
    updates.firstName = normalizeOptionalString(updates.firstName);
    if (!updates.firstName) {
      throw new ApiError(400, "First name cannot be empty");
    }
  }

  if (updates.lastName !== undefined) {
    updates.lastName = normalizeOptionalString(updates.lastName);
    if (!updates.lastName) {
      throw new ApiError(400, "Last name cannot be empty");
    }
  }

  if (updates.phone !== undefined) {
    updates.phone = normalizeOptionalString(updates.phone);
    if (!updates.phone) {
      throw new ApiError(400, "Phone number cannot be empty");
    }

    if (updates.phone !== user.phone) {
      const existingPhoneUser = await User.findOne({
        phone: updates.phone,
        _id: { $ne: user._id },
      });

      if (existingPhoneUser) {
        throw new ApiError(409, "Phone number already in use");
      }
    }
  }

  if (updates.bio !== undefined) {
    updates.bio = normalizeString(updates.bio);
  }

  if (updates.profilePicture !== undefined) {
    updates.profilePicture = normalizeString(updates.profilePicture);
  }

  const resultingRole = updates.role || user.role;
  const locationPayload = getLocationPayload(updates);
  const requestedLocationFields = Object.keys(locationPayload);

  if (resultingRole !== "farmer" && requestedLocationFields.length > 0) {
    throw new ApiError(
      400,
      "Location fields can only be set for farmer accounts",
    );
  }

  if (resultingRole === "farmer") {
    const resultingLocation = {
      region:
        locationPayload.region !== undefined
          ? locationPayload.region
          : normalizeOptionalString(user.region),
      zone:
        locationPayload.zone !== undefined
          ? locationPayload.zone
          : normalizeOptionalString(user.zone),
      woreda:
        locationPayload.woreda !== undefined
          ? locationPayload.woreda
          : normalizeOptionalString(user.woreda),
      kebele:
        locationPayload.kebele !== undefined
          ? locationPayload.kebele
          : normalizeOptionalString(user.kebele),
    };

    if (Object.values(resultingLocation).some((value) => !value)) {
      throw new ApiError(
        400,
        "Region, zone, woreda and kebele are required for farmer accounts",
      );
    }

    Object.assign(updates, resultingLocation);
  }

  if (updates.verificationRejectionReason !== undefined) {
    updates.verificationRejectionReason = normalizeOptionalString(
      updates.verificationRejectionReason,
    );
  }

  if (updates.verificationStatus !== undefined) {
    if (updates.verificationStatus === "verified") {
      updates.isVerified = true;
      updates.verificationRejectionReason = undefined;
    }

    if (["unverified", "pending"].includes(updates.verificationStatus)) {
      updates.isVerified = false;
      updates.verificationRejectionReason = undefined;
    }

    if (updates.verificationStatus === "rejected") {
      updates.isVerified = false;
      if (!updates.verificationRejectionReason) {
        throw new ApiError(
          400,
          "Rejection reason is required when verification status is rejected",
        );
      }
    }
  }

  if (
    updates.isVerified !== undefined &&
    updates.verificationStatus === undefined
  ) {
    if (updates.isVerified) {
      updates.verificationStatus = "verified";
      updates.verificationRejectionReason = undefined;
    } else if (user.verificationStatus === "verified") {
      updates.verificationStatus = "unverified";
    }
  }

  if (updates.isActive !== undefined) {
    updates.deactivatedAt = updates.isActive ? null : new Date();
  }

  Object.entries(updates).forEach(([field, value]) => {
    user[field] = value;
  });

  await user.save();

  const updatedUser = await User.findById(user._id).select(USER_SAFE_SELECT);

  return res.json(
    new ApiResponse(200, { user: updatedUser }, "User updated successfully"),
  );
});

export const setUserActiveStatus = asyncHandler(async (req, res) => {
  ensureAdmin(req.user);

  const { isActive } = req.body;

  if (typeof isActive !== "boolean") {
    throw new ApiError(400, "isActive must be boolean");
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!isActive && user._id.toString() === req.user._id.toString()) {
    throw new ApiError(400, "Admin cannot deactivate their own account");
  }

  user.isActive = isActive;
  user.deactivatedAt = isActive ? null : new Date();

  await user.save();

  const updatedUser = await User.findById(user._id).select(USER_SAFE_SELECT);

  return res.json(
    new ApiResponse(
      200,
      { user: updatedUser },
      "User active status updated successfully",
    ),
  );
});

// Get farmer dashboard data
export const getFarmerDashboard = asyncHandler(async (req, res) => {
  ensureFarmer(req.user);

  const farmerId = req.user._id;

  // Aggregate asset statistics
  const totalAssets = await Asset.countDocuments({ farmer: farmerId });
  const pendingAssets = await Asset.countDocuments({
    farmer: farmerId,
    status: "pending",
  });
  const verifiedAssets = await Asset.countDocuments({
    farmer: farmerId,
    status: "verified",
  });

  // Aggregate listing statistics
  const totalListings = await Listing.countDocuments({ farmer: farmerId });
  const activeListings = await Listing.countDocuments({
    farmer: farmerId,
    status: "active",
  });
  const completedListings = await Listing.countDocuments({
    farmer: farmerId,
    status: "completed",
  });

  // Calculate total capital sought vs raised (simplified)
  const allFarmerListings = await Listing.find({ farmer: farmerId });
  const totalGoalBirr = allFarmerListings.reduce(
    (sum, list) => sum + list.investmentGoalBirr,
    0,
  );

  return res.json(
    new ApiResponse(
      200,
      {
        user: req.user,
        stats: {
          assets: {
            total: totalAssets,
            pending: pendingAssets,
            verified: verifiedAssets,
          },
          listings: {
            total: totalListings,
            active: activeListings,
            completed: completedListings,
          },
          financials: {
            totalGoalBirr,
            walletBalance: req.user.walletBalance,
          },
        },
      },
      "Farmer dashboard data retrieved",
    ),
  );
});
