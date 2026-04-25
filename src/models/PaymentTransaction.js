import mongoose from "mongoose";

const { Schema } = mongoose;

const bankAccountSchema = new Schema(
  {
    accountName: {
      type: String,
      trim: true,
      default: null,
    },
    accountNumber: {
      type: String,
      trim: true,
      default: null,
    },
    bankCode: {
      type: String,
      trim: true,
      default: null,
    },
    bankName: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: false },
);

const paymentTransactionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["deposit", "withdrawal"],
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ["chapa"],
      default: "chapa",
      index: true,
    },
    txRef: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    providerReference: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "successful", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    amountBirr: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      default: "ETB",
      trim: true,
      uppercase: true,
    },
    checkoutUrl: {
      type: String,
      trim: true,
      default: null,
    },
    bankAccount: {
      type: bankAccountSchema,
      default: () => ({}),
    },
    failureReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    settledAt: {
      type: Date,
      default: null,
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

paymentTransactionSchema.index({ user: 1, createdAt: -1 });
paymentTransactionSchema.index({ status: 1, type: 1, createdAt: -1 });

export default mongoose.model("PaymentTransaction", paymentTransactionSchema);
