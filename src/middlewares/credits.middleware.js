import { deductCredits } from "../services/agriCredits.service.js";

export const requireAgriCredits = (amount, type, descriptionFn) => {
  return async (req, res, next) => {
    try {
      // For refundable actions we deduct first → refund later if needed
      await deductCredits(
        req.user._id,
        amount,
        type,
        descriptionFn ? descriptionFn(req) : `Deduction for ${type}`,
        req.body?.assetId || req.params?.id || null,
        req.body?.assetId ? "Asset" : null,
      );
      next();
    } catch (err) {
      next(err);
    }
  };
};
