import mongoose from "mongoose";
const Schema = mongoose.Schema;

const creditTransactionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "monthly_reset",
        "signup_bonus",
        "purchase",
        "deduction_listing",
        "deduction_boost",
        "deduction_relist",
        "deduction_priority",
        "deduction_dispute",
        "refund_listing",
        "refund_other",
      ], //for now consider only the first 4 types, can expand later
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    referenceId: {
      type: Schema.Types.ObjectId, // e.g. listingId, purchaseId
      refPath: "referenceModel",
    },
    referenceModel: {
      type: String, // 'Listing', 'CreditPurchase', etc.
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

export default mongoose.model("CreditTransaction", creditTransactionSchema);
