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
      default: 0,
    },
    purchasedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// Compound index for fast queries
shareOwnershipSchema.index({ listing: 1, investor: 1 }, { unique: true });

export default mongoose.model("ShareOwnership", shareOwnershipSchema);
