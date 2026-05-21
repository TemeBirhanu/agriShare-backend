import mongoose from "mongoose";
const { Schema } = mongoose;

const assetSchema = new Schema(
  {
    farmer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["livestock"],
      required: true,
      default: "livestock",
    },
    name: {
      // e.g. "Dad's Teff Plot - Gozamin" or "Holstein-Friesian Cow #ET123"
      type: String,
      required: true,
      trim: true,
      unique: [true, "Farmer cannot have duplicate asset names"],
    },
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "verified",
        "rejected",
        "listed",
        "active",
        "completed",
        "archived",
      ],
      default: "pending",
    },
    verificationComment: {
      type: String,
      trim: true,
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User", // admin who verified
    },
    verifiedAt: {
      type: Date,
    },

    // common fields for cattle assets
    location: {
      kebele: { type: String, required: true },
      woreda: { type: String, required: true },
      zone: { type: String, required: true },
      region: { type: String, required: true }, // e.g. Amhara, Oromia, SNNPR
      gps: {
        latitude: { type: Number },
        longitude: { type: Number },
      },
    },
    photos: [
      {
        url: { type: String }, // later: Cloudinary or IPFS URL
        description: { type: String },
      },
    ],
    documents: [
      {
        type: { type: String }, // e.g. "land_holding_certificate", "vaccination_card", "sales_receipt"
        url: { type: String },
        originalName: { type: String },
      },
    ],

    // cattle-specific fields
    livestockDetails: {
      type: {
        sex: {
          type: String,
          enum: ["male", "female", "castrated"],
          required: true,
        },
        identification: {
          etLitsId: { type: String }, // ET-LITS ear tag / national ID if registered
          localTag: { type: String }, // farmer's own tag/number
        },
        healthStatus: {
          vaccinated: { type: Boolean, default: false },
          lastVaccinationDate: { type: Date },
          diseasesTreated: [{ type: String }],
        },
        purpose: {
          type: String,
          enum: ["dairy", "meat", "breeding", "draught", "multiple"],
        },
      },
    },
    currentListing: {
      type: Schema.Types.ObjectId,
      ref: "Listing",
    },
    // blockchain-related fields
    nftTokenId: {
      type: Number,
    },
    nftTxHash: {
      type: String,
    },
    nftMintedAt: {
      type: Date,
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  },
);

// Validation to ensure only cattle assets are stored and the minimal livestock details exist
assetSchema.pre("save", async function () {
  if (this.type !== "livestock") {
    throw new Error("Only livestock assets are supported");
  }

  if (!this.livestockDetails?.sex) {
    throw new Error("Livestock sex is required");
  }
});

export default mongoose.model("Asset", assetSchema);
