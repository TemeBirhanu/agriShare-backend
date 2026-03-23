import Listing from "../models/Listing.js";
import Review from "../models/Review.js";
import InvestmentContract from "../models/InvestmentContract.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";

const parsePagination = (query) => {
  const pageRaw = Number.parseInt(query.page, 10);
  const limitRaw = Number.parseInt(query.limit, 10);

  const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
  const limit = Number.isNaN(limitRaw)
    ? 10
    : Math.max(1, Math.min(limitRaw, 50));

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

export const createReview = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id).select("_id");
  if (!listing) {
    throw new ApiError(404, "Listing not found");
  }

  // Investor must have an active investment in this listing
  const investment = await InvestmentContract.findOne({
    listing: listing._id,
    investor: req.user._id,
  });
  if (!investment) {
    throw new ApiError(
      403,
      "You can only review listings that you have invested in",
    );
  }

  // One review per investor per listing
  const existing = await Review.findOne({
    listing: listing._id,
    investor: req.user._id,
  });
  if (existing) {
    throw new ApiError(
      409,
      "You have already submitted a review for this listing",
    );
  }

  const body = normalizeText(req.body.body);
  if (!body) {
    throw new ApiError(400, "Review body is required");
  }
  if (body.length < 20 || body.length > 3000) {
    throw new ApiError(
      400,
      "Review body must be between 20 and 3000 characters",
    );
  }

  const review = await Review.create({
    listing: listing._id,
    investor: req.user._id,
    body,
  });

  await review.populate("investor", "fullName profilePicture");

  return res
    .status(201)
    .json(new ApiResponse(201, { review }, "Review posted successfully"));
});

export const getListingReviews = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id).select("_id");
  if (!listing) {
    throw new ApiError(404, "Listing not found");
  }

  const { page, limit, skip } = parsePagination(req.query);

  const [total, reviews] = await Promise.all([
    Review.countDocuments({ listing: listing._id }),
    Review.find({ listing: listing._id })
      .sort({ createdAt: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .populate("investor", "fullName profilePicture"),
  ]);

  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
  const hasMore = page * limit < total;

  return res.json(
    new ApiResponse(
      200,
      {
        reviews,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasMore,
        },
      },
      "Reviews retrieved successfully",
    ),
  );
});

export const updateReview = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id).select("_id");
  if (!listing) {
    throw new ApiError(404, "Listing not found");
  }

  const review = await Review.findOne({
    _id: req.params.reviewId,
    listing: listing._id,
  });
  if (!review) {
    throw new ApiError(404, "Review not found");
  }

  if (String(review.investor) !== String(req.user._id)) {
    throw new ApiError(403, "You can only edit your own reviews");
  }

  const body = normalizeText(req.body.body);
  if (!body) {
    throw new ApiError(400, "Review body is required");
  }
  if (body.length < 20 || body.length > 3000) {
    throw new ApiError(
      400,
      "Review body must be between 20 and 3000 characters",
    );
  }

  review.body = body;
  await review.save();

  await review.populate("investor", "fullName profilePicture");

  return res.json(
    new ApiResponse(200, { review }, "Review updated successfully"),
  );
});

export const deleteReview = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id).select("_id");
  if (!listing) {
    throw new ApiError(404, "Listing not found");
  }

  const review = await Review.findOne({
    _id: req.params.reviewId,
    listing: listing._id,
  });
  if (!review) {
    throw new ApiError(404, "Review not found");
  }

  if (String(review.investor) !== String(req.user._id)) {
    throw new ApiError(403, "You can only delete your own reviews");
  }

  await review.deleteOne();

  return res.json(
    new ApiResponse(200, { deleted: true }, "Review deleted successfully"),
  );
});
