import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import Asset from "../models/Asset.js";
import {
  createNotificationSafe,
  notifyRoleSafe,
} from "../services/notification.service.js";
// import { mintNFT } from "../services/blockchain.service.js"; // Assuming blockchain service is updated too or will be

// Create asset
const createAsset = asyncHandler(async (req, res) => {
  if (req.user.role !== "farmer") {
    throw new ApiError(403, "Only farmers can create assets");
  }

  // Extract uploaded files
  const photos =
    req.files?.photos?.map((file) => ({
      url: file.path,
      description: "Uploaded photo",
    })) || [];

  const documents =
    req.files?.documents?.map((file) => ({
      type: "uploaded_document",
      url: file.path,
      originalName: file.originalname,
    })) || [];

  const assetData = {
    ...req.body,
    photos: photos.length > 0 ? photos : req.body.photos,
    documents: documents.length > 0 ? documents : req.body.documents,
    farmer: req.user._id,
    status: "pending",
  };

  const asset = await Asset.create(assetData);

  await notifyRoleSafe("admin", {
    type: "asset_pending",
    title: "New Asset Pending Verification",
    message: `Asset \"${asset.name}\" is submitted and awaiting admin review`,
    referenceId: asset._id,
    referenceModel: "Asset",
    meta: {
      farmerId: req.user._id,
      assetType: asset.type,
    },
  });

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { asset },
        "Asset created successfully – awaiting verification",
      ),
    );
});

//  Get single asset (public or auth – for now anyone can see details)
const getAssetById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const asset = await Asset.findById(id)
    .populate("farmer", "fullName phone")
    .populate("verifiedBy", "fullName")
    .select("-__v");

  if (!asset) {
    throw new ApiError(404, "Asset not found");
  }

  return res.json(new ApiResponse(200, { asset }, "Asset details retrieved"));
});

// Get my assets
const getMyAssets = asyncHandler(async (req, res) => {
  if (req.user.role !== "farmer") {
    throw new ApiError(403, "Only farmers can view their own assets");
  }

  const assets = await Asset.find({ farmer: req.user._id })
    .sort({ createdAt: -1 })
    .select("-__v"); // exclude version key

  return res.json(
    new ApiResponse(
      200,
      { assets, count: assets.length },
      "Your assets retrieved",
    ),
  );
});

// Get pending assets (admin only – for verification dashboard)
const getPendingAssets = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    throw new ApiError(403, "Only admins can view pending assets");
  }

  const assets = await Asset.find({ status: "pending" })
    .populate("farmer", "fullName phone email") // show farmer info
    .sort({ createdAt: 1 })
    .select("-__v");

  return res.json(
    new ApiResponse(
      200,
      { assets, count: assets.length },
      "Pending assets for verification",
    ),
  );
});

// Verify / Reject asset (admin only)
const verifyAsset = asyncHandler(async (req, res) => {
  if (req.user.role !== "admin") {
    throw new ApiError(403, "Only admins can verify assets");
  }

  const { id } = req.params;
  const { status, comment } = req.body; // status: 'verified' or 'rejected', comment optional

  if (!["verified", "rejected"].includes(status)) {
    throw new ApiError(400, 'Status must be "verified" or "rejected"');
  }

  const asset = await Asset.findById(id);
  if (!asset) {
    throw new ApiError(404, "Asset not found");
  }

  if (asset.status !== "pending") {
    throw new ApiError(400, `Asset is already ${asset.status}`);
  }

  asset.status = status;
  asset.verificationComment = comment || undefined;
  asset.verifiedBy = req.user._id;
  asset.verifiedAt = new Date();

  await asset.save();

  await createNotificationSafe({
    recipient: asset.farmer,
    type: "asset_verification",
    title:
      status === "verified"
        ? "Asset Verification Approved"
        : "Asset Verification Rejected",
    message:
      status === "verified"
        ? `Your asset \"${asset.name}\" is verified and ready for listing.`
        : `Your asset \"${asset.name}\" was rejected${
            comment ? ` due to: ${comment}` : "."
          }`,
    referenceId: asset._id,
    referenceModel: "Asset",
    meta: {
      status,
      comment: comment || null,
    },
  });

  const message =
    status === "verified" ? "Asset verified successfully" : "Asset rejected";

  // // If verified, mint NFT
  // if (status === "verified") {
  //   // Prepare simple metadata URI (later: real IPFS)
  //   const metadata = {
  //     name: `${asset.type === "farmland" ? "Farmland" : "Livestock"} - ${asset.name}`,
  //     description: asset.description || "Asset tokenized on AgriShare",
  //     image: asset.photos?.[0]?.url || "https://via.placeholder.com/400", // placeholder
  //     attributes: [
  //       { trait_type: "Type", value: asset.type },
  //       {
  //         trait_type: "Location",
  //         value: `${asset.location.region}, ${asset.location.woreda}`,
  //       },

  //       // add more from farmlandDetails / livestockDetails later
  //     ],
  //   };

  //   // For MVP: use JSON string as data URI (real: upload to Pinata/IPFS)
  //   const metadataURI = `data:application/json,${encodeURIComponent(JSON.stringify(metadata))}`;

  //   const { tokenId, txHash } = await mintNFT(
  //     process.env.CUSTODIAL_WALLET_ADDRESS || wallet.address, // farmer's custodial address or platform
  //     metadataURI,
  //   );

  //   asset.nftTokenId = tokenId;
  //   asset.nftTxHash = txHash;
  //   asset.nftMintedAt = new Date();
  // }
  return res.json(new ApiResponse(200, { asset }, message));
});

export {
  createAsset,
  getMyAssets,
  getPendingAssets,
  verifyAsset,
  getAssetById,
};
