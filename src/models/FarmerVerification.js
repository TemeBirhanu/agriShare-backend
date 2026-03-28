import mongoose from "mongoose";

const { Schema } = mongoose;

const farmerVerificationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    faydaIdNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    idFrontImage: {
      type: String,
      required: true,
    },
    idBackImage: {
      type: String,
      required: true,
    },
    selfieImage: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

farmerVerificationSchema.index({ faydaIdNumber: 1 });
farmerVerificationSchema.index({ status: 1, submittedAt: 1 });

export default mongoose.model("FarmerVerification", farmerVerificationSchema);
