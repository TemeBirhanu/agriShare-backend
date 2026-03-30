import mongoose from "mongoose";
import bcrypt from "bcryptjs";
const Schema = mongoose.Schema;

const userSchema = new Schema(
  {
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ["farmer", "investor", "admin"],
      default: "investor",
    },
    region: {
      type: String,
      trim: true,
      required: function () {
        return this.role === "farmer";
      },
    },
    zone: {
      type: String,
      trim: true,
      required: function () {
        return this.role === "farmer";
      },
    },
    woreda: {
      type: String,
      trim: true,
      required: function () {
        return this.role === "farmer";
      },
    },
    kebele: {
      type: String,
      trim: true,
      required: function () {
        return this.role === "farmer";
      },
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 600,
    },
    profilePicture: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    deactivatedAt: {
      type: Date,
      default: null,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationStatus: {
      type: String,
      enum: ["unverified", "pending", "verified", "rejected"],
      default: function () {
        return this.role === "admin" ? "verified" : "unverified";
      },
    },
    emailVerificationCodeHash: {
      type: String,
      default: null,
      select: false,
    },
    emailVerificationCodeExpiresAt: {
      type: Date,
      default: null,
    },
    emailVerificationLastSentAt: {
      type: Date,
      default: null,
    },
    emailVerificationAttemptCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    verificationRejectionReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    walletBalance: {
      type: Number,
      default: 0,
    },
    fundWalletBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    agriCreditsBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastMonthlyCreditReset: {
      type: Date,
      default: null,
    },
    agriCreditsHistory: [
      {
        type: Schema.Types.ObjectId,
        ref: "CreditTransaction",
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("User", userSchema);
