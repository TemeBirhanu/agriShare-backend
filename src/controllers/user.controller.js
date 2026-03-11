import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import User from "../models/User.js";
import Asset from "../models/Asset.js";
import Listing from "../models/Listing.js";

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

// Get farmer dashboard data
export const getFarmerDashboard = asyncHandler(async (req, res) => {
    if (req.user.role !== "farmer") {
        throw new ApiError(403, "Only farmers can view their dashboard");
    }

    const farmerId = req.user._id;

    // Aggregate asset statistics
    const totalAssets = await Asset.countDocuments({ farmer: farmerId });
    const pendingAssets = await Asset.countDocuments({ farmer: farmerId, status: "pending" });
    const verifiedAssets = await Asset.countDocuments({ farmer: farmerId, status: "verified" });

    // Aggregate listing statistics
    const totalListings = await Listing.countDocuments({ farmer: farmerId });
    const activeListings = await Listing.countDocuments({ farmer: farmerId, status: "active" });
    const completedListings = await Listing.countDocuments({ farmer: farmerId, status: "completed" });

    // Calculate total capital sought vs raised (simplified)
    const allFarmerListings = await Listing.find({ farmer: farmerId });
    const totalGoalBirr = allFarmerListings.reduce((sum, list) => sum + list.investmentGoalBirr, 0);

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
                    }
                }
            },
            "Farmer dashboard data retrieved",
        ),
    );
});

