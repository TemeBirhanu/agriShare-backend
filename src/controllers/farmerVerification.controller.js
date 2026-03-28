import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import User from "../models/User.js";
import FarmerVerification from "../models/FarmerVerification.js";

const ensureFarmer = (user) => {
  if (!user || user.role !== "farmer") {
    throw new ApiError(403, "Only farmers can access this route");
  }
};

const normalizeFaydaId = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

export const submitFarmerVerification = asyncHandler(async (req, res) => {
  ensureFarmer(req.user);

  if (req.user.verificationStatus === "verified") {
    throw new ApiError(400, "Farmer is already verified");
  }

  const faydaIdNumber = normalizeFaydaId(req.body.faydaIdNumber);
  if (!faydaIdNumber) {
    throw new ApiError(400, "Fayda ID number is required");
  }

  const idFrontImage = req.files?.idFrontImage?.[0]?.path;
  const idBackImage = req.files?.idBackImage?.[0]?.path;
  const selfieImage = req.files?.selfieImage?.[0]?.path || null;

  if (!idFrontImage || !idBackImage) {
    throw new ApiError(400, "ID front image and ID back image are required");
  }

  const duplicateVerification = await FarmerVerification.findOne({
    user: { $ne: req.user._id },
    faydaIdNumber,
    status: { $in: ["pending", "verified"] },
  });

  if (duplicateVerification) {
    throw new ApiError(409, "This Fayda ID is already in use");
  }

  let verification = await FarmerVerification.findOne({ user: req.user._id });

  if (verification && verification.status === "pending") {
    throw new ApiError(
      400,
      "You already have a pending verification request under review",
    );
  }

  if (!verification) {
    verification = await FarmerVerification.create({
      user: req.user._id,
      faydaIdNumber,
      idFrontImage,
      idBackImage,
      selfieImage,
      status: "pending",
      submittedAt: new Date(),
    });
  } else {
    verification.faydaIdNumber = faydaIdNumber;
    verification.idFrontImage = idFrontImage;
    verification.idBackImage = idBackImage;
    verification.selfieImage = selfieImage;
    verification.status = "pending";
    verification.reason = undefined;
    verification.reviewedAt = null;
    verification.reviewedBy = null;
    verification.submittedAt = new Date();
    await verification.save();
  }

  await User.findByIdAndUpdate(req.user._id, {
    verificationStatus: "pending",
    verificationRejectionReason: undefined,
    isVerified: false,
  });

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { verification },
        "Verification submitted successfully and is pending admin review",
      ),
    );
});

export const getMyFarmerVerification = asyncHandler(async (req, res) => {
  ensureFarmer(req.user);

  const user = await User.findById(req.user._id)
    .select("verificationStatus verificationRejectionReason")
    .lean();

  const verification = await FarmerVerification.findOne({ user: req.user._id })
    .populate("reviewedBy", "firstName lastName email")
    .lean();

  return res.json(
    new ApiResponse(
      200,
      {
        verificationStatus: user?.verificationStatus || "unverified",
        verificationRejectionReason: user?.verificationRejectionReason || null,
        verification,
      },
      "Farmer verification status retrieved",
    ),
  );
});

export const getPendingFarmerVerifications = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    throw new ApiError(
      403,
      "Only admins can view pending farmer verifications",
    );
  }

  const verifications = await FarmerVerification.find({ status: "pending" })
    .populate(
      "user",
      "firstName lastName email phone region zone woreda kebele verificationStatus",
    )
    .sort({ submittedAt: 1 });

  return res.json(
    new ApiResponse(
      200,
      { verifications, count: verifications.length },
      "Pending farmer verifications retrieved",
    ),
  );
});

export const reviewFarmerVerification = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    throw new ApiError(403, "Only admins can review farmer verification");
  }

  const { id } = req.params;
  const { status, reason } = req.body;

  if (!["verified", "rejected"].includes(status)) {
    throw new ApiError(400, 'Status must be "verified" or "rejected"');
  }

  const rejectionReason = reason ? String(reason).trim() : "";
  if (status === "rejected" && !rejectionReason) {
    throw new ApiError(400, "Reason is required when rejecting verification");
  }

  const verification = await FarmerVerification.findById(id);
  if (!verification) {
    throw new ApiError(404, "Verification request not found");
  }

  if (verification.status !== "pending") {
    throw new ApiError(
      400,
      `Verification request is already ${verification.status}`,
    );
  }

  if (status === "verified") {
    const duplicateVerification = await FarmerVerification.findOne({
      _id: { $ne: verification._id },
      faydaIdNumber: verification.faydaIdNumber,
      status: { $in: ["pending", "verified"] },
    });

    if (duplicateVerification) {
      throw new ApiError(409, "Duplicate Fayda ID detected");
    }
  }

  verification.status = status;
  verification.reason = status === "rejected" ? rejectionReason : undefined;
  verification.reviewedBy = req.user._id;
  verification.reviewedAt = new Date();
  await verification.save();

  await User.findByIdAndUpdate(verification.user, {
    verificationStatus: status,
    verificationRejectionReason:
      status === "rejected" ? rejectionReason : undefined,
    isVerified: status === "verified",
  });

  const updatedVerification = await FarmerVerification.findById(
    verification._id,
  )
    .populate("user", "firstName lastName email phone")
    .populate("reviewedBy", "firstName lastName email");

  const message =
    status === "verified"
      ? "Farmer verification approved successfully"
      : "Farmer verification rejected";

  return res.json(
    new ApiResponse(200, { verification: updatedVerification }, message),
  );
});
