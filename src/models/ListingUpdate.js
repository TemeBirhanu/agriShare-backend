import mongoose from "mongoose";

const { Schema } = mongoose;

const listingUpdateImageSchema = new Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    caption: {
      type: String,
      trim: true,
      maxlength: 200,
    },
  },
  { _id: false },
);

const listingUpdateSchema = new Schema(
  {
    listing: {
      type: Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true,
    },
    farmer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 120,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      minlength: 20,
      maxlength: 3000,
    },
    images: {
      type: [listingUpdateImageSchema],
      default: [],
      validate: {
        validator: (value) => !value || value.length <= 3,
        message: "A listing update can include at most 3 images",
      },
    },
    postedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

listingUpdateSchema.index({ listing: 1, postedAt: 1, createdAt: 1 });

export default mongoose.model("ListingUpdate", listingUpdateSchema);
