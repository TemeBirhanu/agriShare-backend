import mongoose from "mongoose";
const Schema = mongoose.Schema;

const listingSchema = new Schema(
  {
    asset: {
      type: Schema.Types.ObjectId,
      ref: "Asset",
      required: true,
    },
    farmer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "active",
        "funded",
        "completed",
        "cancelled",
        "failed",
        "refunded",
      ],
      default: "active",
      index: true,
    },
    investmentGoalBirr: {
      type: Number,
      required: true,
      min: 1000,
    },
    sharesToSellPercent: {
      type: Number,
      required: true,
      min: 1,
      max: 49, // cap to keep majority with farmer
    },
    expectedTotalYieldBirr: {
      type: Number,
      required: true,
      min: 5000,
    },
    pitchTitle: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 120,
    },
    pitchText: {
      type: String,
      required: true,
      trim: true,
      minlength: 50,
      maxlength: 3000,
    },
    useOfFunds: {
      type: String,
      required: true,
      trim: true,
      minlength: 30,
      maxlength: 2000,
    },
    riskFactors: {
      type: String,
      required: true,
      trim: true,
      minlength: 30,
      maxlength: 2000,
    },
    investmentDeadline: {
      type: Date,
      required: true,
      index: true,
    },
    totalInvestedBirr: {
      type: Number,
      default: 0,
      min: 0,
    },
    payoutMode: {
      type: String,
      enum: ["fixed", "offset"],
      default: "fixed",
    },
    payoffDaysFromRelease: {
      type: Number,
      min: 1,
      default: null,
    },
    paydayDate: {
      type: Date,
      required: function () {
        return this.payoutMode === "fixed";
      },
    },
    effectivePaydayDate: {
      type: Date,
      default: null,
    },
    fundingGoalReachedAt: {
      type: Date,
      default: null,
    },
    releasedToFarmerAt: {
      type: Date,
      default: null,
    },
    refundedAt: {
      type: Date,
      default: null,
    },
    refundReason: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },
    minSharesPerInvestor: {
      type: Number,
      default: 1,
      min: 1,
    },
    sharePricePerTokenBirr: {
      type: Number, // auto-calculated: goal / (100 * sharesToSellPercent / 100)
    },
    shareTokenAddress: {
      type: String, // deployed ERC-20 address
    },
    shareTokenSymbol: {
      type: String, // e.g. "TS-AssetID"
    },
    totalShares: {
      type: Number,
      default: 100,
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

listingSchema.index({ status: 1, investmentDeadline: 1 });

export default mongoose.model("Listing", listingSchema);
