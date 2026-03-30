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
      enum: ["farmland", "livestock"],
      required: true,
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

    // common fields for both farmland and livestock
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

    // farmland-specific fields (only required if type === "farmland")
    farmlandDetails: {
      type: {
        sizeHa: { type: Number, min: 0.01 }, // in hectares (common unit in Ethiopia)
        soilType: {
          type: String,
          enum: [
            "black_soil",
            "red_soil",
            "vertisol",
            "andosol",
            "fluvisol",
            "other",
          ],
        },
        fertilityGrade: {
          type: String,
          enum: ["high", "medium", "low"],
        },
        mainCrops: [{ type: String }], // e.g. ["teff", "maize", "wheat"]
        irrigation: {
          type: Boolean,
          default: false,
        },
        landHoldingCertificateNumber: { type: String }, // First or second-level cert number
        holdingType: {
          type: String,
          enum: ["individual", "joint", "family", "communal_use_right"],
        },
        coHolders: [{ type: String }], // names of spouse/family if joint
      },
    },

    //livestock-specific fields
    livestockDetails: {
      type: {
        species: {
          type: String,
          enum: ["cattle", "sheep", "goat", "camel", "other"],
          required: true,
        },
        breed: { type: String }, // e.g. "Boran", "Horro", "local indigenous", "Holstein cross"
        sex: {
          type: String,
          enum: ["male", "female", "castrated"],
        },
        ageYears: { type: Number, min: 0 },
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
        quantity: { type: Number, min: 1, default: 1 }, // e.g. herd of 5 sheep
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
    discriminatorKey: "type", // if you want to use discriminators later
  },
);

// Validation to ensure farmland assets have size and livestock assets have species
assetSchema.pre("save", async function () {
  if (this.type === "farmland" && !this.farmlandDetails?.sizeHa) {
    throw new Error("Farmland size in hectares is required");
  }
  if (this.type === "livestock" && !this.livestockDetails?.species) {
    throw new Error("Livestock species is required");
  }
});

export default mongoose.model("Asset", assetSchema);
