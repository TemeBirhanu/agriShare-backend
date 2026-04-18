import mongoose from "mongoose";

const { Schema } = mongoose;

const investorRefundRequestSchema = new Schema(
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
      index: true,
    },
    farmer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    investorReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    adminNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    requestedAmountBirr: {
      type: Number,
      required: true,
      min: 0,
    },
    requestedShares: {
      type: Number,
      default: 0,
      min: 0,
    },
    requestedContractCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    refundedAmountBirr: {
      type: Number,
      default: 0,
      min: 0,
    },
    refundedShares: {
      type: Number,
      default: 0,
      min: 0,
    },
    refundedContractCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    refundProcessedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

investorRefundRequestSchema.index({ investor: 1, status: 1, createdAt: -1 });
investorRefundRequestSchema.index({ listing: 1, status: 1, createdAt: -1 });
investorRefundRequestSchema.index({ investor: 1, listing: 1, status: 1 });

export default mongoose.model(
  "InvestorRefundRequest",
  investorRefundRequestSchema,
);
