import mongoose from "mongoose";
const Schema = mongoose.Schema;

const investmentContractSchema = new Schema(
  {
    listing: {
      type: Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
    },
    investor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    farmer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sharesPurchased: {
      type: Number,
      required: true,
      min: 1,
    },
    amountPaidBirr: {
      type: Number,
      required: true,
    },
    contractNumber: {
      type: String,
      unique: true,
    },
    signedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["active", "completed", "disputed"],
      default: "active",
    },
    pdfUrl: {
      // later: Cloudinary or local file path
      type: String,
    },
    termsHash: {
      // for future blockchain anchoring
      type: String,
    },
  },
  { timestamps: true },
);

investmentContractSchema.pre("save", async function () {
  if (this.isNew) {
    const last = await this.constructor.findOne().sort({ signedAt: -1 });
    const seq = last ? parseInt(last.contractNumber.split("-")[2]) + 1 : 1;
    this.contractNumber = `AGR-${new Date().getFullYear()}-${seq
      .toString()
      .padStart(4, "0")}`;
  }
});

export default mongoose.model("InvestmentContract", investmentContractSchema);
