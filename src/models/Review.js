import mongoose from "mongoose";

const { Schema } = mongoose;

const reviewSchema = new Schema(
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
    body: {
      type: String,
      required: true,
      trim: true,
      minlength: 20,
      maxlength: 3000,
    },
  },
  { timestamps: true },
);

// One review per investor per listing
reviewSchema.index({ listing: 1, investor: 1 }, { unique: true });

// Efficient pagination sorted by creation time
reviewSchema.index({ listing: 1, createdAt: 1 });

export default mongoose.model("Review", reviewSchema);
