import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import User from "../models/User.js";

// Get all users (Admin only)
export const getAllUsers = asyncHandler(async (req, res) => {
    if (req.user.role !== "admin") {
        throw new ApiError(403, "Only admins can view all users");
    }

    // Find all users and exclude the password field
    const users = await User.find().select("-password").sort({ createdAt: -1 });

    return res.json(
        new ApiResponse(
            200,
            { users, count: users.length },
            "All users retrieved successfully",
        ),
    );
});
