import TransactionHistory from "../models/TransactionHistory.js";

const withSession = (session) => (session ? { session } : {});

export const recordTransactionHistory = async (
  {
    user,
    category,
    direction,
    amountBirr,
    status = "successful",
    title,
    description = null,
    sourceModel = null,
    sourceId = null,
    referenceCode = null,
    currency = "ETB",
    metadata = null,
  },
  session = null,
) => {
  const [record] = await TransactionHistory.create(
    [
      {
        user,
        category,
        direction,
        amountBirr,
        status,
        title,
        description,
        sourceModel,
        sourceId,
        referenceCode,
        currency,
        metadata,
      },
    ],
    withSession(session),
  );

  return record;
};
