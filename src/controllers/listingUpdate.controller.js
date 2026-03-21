import Listing from "../models/Listing.js";
import ListingUpdate from "../models/ListingUpdate.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";

const ensureFarmer = (user) => {
  if (!user || user.role !== "farmer") {
    throw new ApiError(403, "Only farmers can access this resource");
  }
};

const ensureListingOwner = (listing, userId) => {
  if (!listing || String(listing.farmer) !== String(userId)) {
    throw new ApiError(403, "You can only manage updates for your own listing");
  }
};

const ensureBeforePayday = (listing) => {
  if (!listing?.paydayDate) {
    throw new ApiError(400, "Listing payday date is missing");
  }

  if (new Date() >= new Date(listing.paydayDate)) {
    throw new ApiError(
      400,
      "Updates can be edited or deleted only before the listing payday",
    );
  }
};

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

const mapUpdateImages = (files) =>
  (Array.isArray(files) ? files : []).map((file) => ({
    url: file.path,
  }));

export const createListingUpdate = asyncHandler(async (req, res) => {
  ensureFarmer(req.user);

  const listing = await Listing.findById(req.params.id).select(
    "_id farmer paydayDate",
  );
  if (!listing) {
    throw new ApiError(404, "Listing not found");
  }

  ensureListingOwner(listing, req.user._id);

  const title = normalizeText(req.body.title);
  const body = normalizeText(req.body.body);

  if (!title) {
    throw new ApiError(400, "Update title is required");
  }
  if (title.length < 5 || title.length > 120) {
    throw new ApiError(
      400,
      "Update title must be between 5 and 120 characters",
    );
  }

  if (!body) {
    throw new ApiError(400, "Update body is required");
  }
  if (body.length < 20 || body.length > 3000) {
    throw new ApiError(
      400,
      "Update body must be between 20 and 3000 characters",
    );
  }

  const images = mapUpdateImages(req.files);
  if (images.length > 3) {
    throw new ApiError(400, "A listing update can include at most 3 images");
  }

  const update = await ListingUpdate.create({
    listing: listing._id,
    farmer: req.user._id,
    title,
    body,
    images,
    postedAt: new Date(),
    isSystem: false,
  });

  return res
    .status(201)
    .json(
      new ApiResponse(201, { update }, "Listing update posted successfully"),
    );
});

export const getListingUpdates = asyncHandler(async (req, res) => {
  const listing = await Listing.findById(req.params.id).select("_id");
  if (!listing) {
    throw new ApiError(404, "Listing not found");
  }

  const { page, limit, skip } = parsePagination(req.query);

  const [total, updates] = await Promise.all([
    ListingUpdate.countDocuments({ listing: listing._id }),
    ListingUpdate.find({ listing: listing._id })
      .sort({ postedAt: 1, createdAt: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .populate("farmer", "fullName profilePicture"),
  ]);

  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
  const hasMore = page * limit < total;

  return res.json(
    new ApiResponse(
      200,
      {
        updates,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasMore,
        },
      },
      "Listing updates retrieved",
    ),
  );
});

export const updateListingUpdate = asyncHandler(async (req, res) => {
  ensureFarmer(req.user);

  const listing = await Listing.findById(req.params.id).select(
    "_id farmer paydayDate",
  );
  if (!listing) {
    throw new ApiError(404, "Listing not found");
  }

  ensureListingOwner(listing, req.user._id);
  ensureBeforePayday(listing);

  const update = await ListingUpdate.findOne({
    _id: req.params.updateId,
    listing: listing._id,
  });
  if (!update) {
    throw new ApiError(404, "Listing update not found");
  }

  if (update.isSystem) {
    throw new ApiError(400, "Automatic system updates cannot be edited");
  }

  let hasChanges = false;

  if (Object.prototype.hasOwnProperty.call(req.body, "title")) {
    const title = normalizeText(req.body.title);
    if (!title) {
      throw new ApiError(400, "Update title cannot be empty");
    }
    if (title.length < 5 || title.length > 120) {
      throw new ApiError(
        400,
        "Update title must be between 5 and 120 characters",
      );
    }

    update.title = title;
    hasChanges = true;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, "body")) {
    const body = normalizeText(req.body.body);
    if (!body) {
      throw new ApiError(400, "Update body cannot be empty");
    }
    if (body.length < 20 || body.length > 3000) {
      throw new ApiError(
        400,
        "Update body must be between 20 and 3000 characters",
      );
    }

    update.body = body;
    hasChanges = true;
  }

  const uploadedImages = mapUpdateImages(req.files);
  if (uploadedImages.length > 0) {
    if (uploadedImages.length > 3) {
      throw new ApiError(400, "A listing update can include at most 3 images");
    }

    update.images = uploadedImages;
    hasChanges = true;
  }

  if (!hasChanges) {
    throw new ApiError(
      400,
      "Provide at least one of title, body, or images to update",
    );
  }

  await update.save();

  return res.json(
    new ApiResponse(200, { update }, "Listing update edited successfully"),
  );
});

export const deleteListingUpdate = asyncHandler(async (req, res) => {
  ensureFarmer(req.user);

  const listing = await Listing.findById(req.params.id).select(
    "_id farmer paydayDate",
  );
  if (!listing) {
    throw new ApiError(404, "Listing not found");
  }

  ensureListingOwner(listing, req.user._id);
  ensureBeforePayday(listing);

  const update = await ListingUpdate.findOne({
    _id: req.params.updateId,
    listing: listing._id,
  });
  if (!update) {
    throw new ApiError(404, "Listing update not found");
  }

  if (update.isSystem) {
    throw new ApiError(400, "Automatic system updates cannot be deleted");
  }

  await update.deleteOne();

  return res.json(
    new ApiResponse(
      200,
      { deleted: true },
      "Listing update deleted successfully",
    ),
  );
});
