import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../src/config/db.config.js";
import User from "../src/models/User.js";

dotenv.config();

const backfillInvestorVerification = async () => {
  try {
    await connectDB();

    const result = await User.updateMany(
      {
        role: "investor",
        $or: [
          { isVerified: { $ne: true } },
          { verificationStatus: { $ne: "verified" } },
        ],
      },
      {
        $set: {
          isVerified: true,
          verificationStatus: "verified",
          emailVerificationCodeExpiresAt: null,
          emailVerificationLastSentAt: null,
          emailVerificationAttemptCount: 0,
        },
        $unset: {
          verificationRejectionReason: "",
          emailVerificationCodeHash: "",
        },
      },
    );

    console.log("Investor verification backfill completed");
    console.log(`Matched: ${result.matchedCount}`);
    console.log(`Modified: ${result.modifiedCount}`);
  } catch (error) {
    console.error("Investor verification backfill failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

backfillInvestorVerification();
