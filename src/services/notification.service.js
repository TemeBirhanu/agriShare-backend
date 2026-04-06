import Notification from "../models/Notification.js";
import User from "../models/User.js";

export const createNotification = async ({
  recipient,
  type,
  title,
  message,
  referenceId = null,
  referenceModel = null,
  meta = null,
}) => {
  return Notification.create({
    recipient,
    type,
    title,
    message,
    referenceId,
    referenceModel,
    meta,
  });
};

export const createNotificationSafe = async (payload) => {
  try {
    return await createNotification(payload);
  } catch (error) {
    console.error("[Notification] Failed to create notification", error);
    return null;
  }
};

export const notifyRole = async (
  role,
  {
    type,
    title,
    message,
    referenceId = null,
    referenceModel = null,
    meta = null,
  },
) => {
  const recipients = await User.find({ role, isActive: true })
    .select("_id")
    .lean();
  if (recipients.length === 0) {
    return [];
  }

  const docs = recipients.map((user) => ({
    recipient: user._id,
    type,
    title,
    message,
    referenceId,
    referenceModel,
    meta,
  }));

  return Notification.insertMany(docs, { ordered: false });
};

export const notifyRoleSafe = async (role, payload) => {
  try {
    return await notifyRole(role, payload);
  } catch (error) {
    console.error(`[Notification] Failed to notify role: ${role}`, error);
    return [];
  }
};

export const notifyUserIds = async (recipientIds, payload) => {
  const uniqueRecipientIds = [
    ...new Set((recipientIds || []).map(String)),
  ].filter(Boolean);

  if (uniqueRecipientIds.length === 0) {
    return [];
  }

  const docs = uniqueRecipientIds.map((recipient) => ({
    recipient,
    ...payload,
  }));

  return Notification.insertMany(docs, { ordered: false });
};

export const notifyUserIdsSafe = async (recipientIds, payload) => {
  try {
    return await notifyUserIds(recipientIds, payload);
  } catch (error) {
    console.error("[Notification] Failed to notify user ids", error);
    return [];
  }
};
