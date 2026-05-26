import mongoose from "mongoose";

const { Schema } = mongoose;

const transactionHistorySchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: [
        "deposit",
        "withdrawal",
        "share_purchase",
        "distribution_payout",
        "fund_release",
        "refund",
        "agri_credit_purchase",
      ],
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "successful", "failed", "cancelled"],
      default: "successful",
      index: true,
    },
    amountBirr: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "ETB",
      trim: true,
      uppercase: true,
    },
    title: {
      type: String,
      trim: true,
      required: true,
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    sourceModel: {
      type: String,
      trim: true,
      default: null,
    },
    sourceId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    referenceCode: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

transactionHistorySchema.index({ user: 1, createdAt: -1 });
transactionHistorySchema.index({ user: 1, category: 1, createdAt: -1 });
transactionHistorySchema.index({ user: 1, status: 1, createdAt: -1 });

export default mongoose.model("TransactionHistory", transactionHistorySchema);
