import mongoose from "mongoose";
const Schema = mongoose.Schema;

const shareOwnershipSchema = new Schema(
  {
    listing: {
      type: Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true,
    },
    investor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    shares: {
      type: Number,
      required: true,
      min: 0,
    },
    purchasedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["active", "completed", "refunded"],
      default: "active",
      index: true,
    },
    distributedAmountBirr: {
      type: Number,
      default: 0,
    },
    // simple ROI tracking (can calculate later if needed)
    roiPercent: { type: Number, default: 0 },
    refundedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

shareOwnershipSchema.index({ listing: 1, investor: 1 }, { unique: true });

export default mongoose.model("ShareOwnership", shareOwnershipSchema);
