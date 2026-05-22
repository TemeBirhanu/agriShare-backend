import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { emitToUser, emitToUsers } from "./socket.service.js";

const toPlainObject = (doc) =>
  typeof doc?.toObject === "function" ? doc.toObject() : doc;

export const emitUnreadNotificationCount = async (userId) => {
  if (!userId) {
    return 0;
  }

  const unreadCount = await Notification.countDocuments({
    recipient: userId,
    isRead: false,
  });

  emitToUser(userId, "notification:count", { unreadCount });
  return unreadCount;
};

const emitCreatedNotification = async (notificationDoc) => {
  const notification = toPlainObject(notificationDoc);
  if (!notification?.recipient) {
    return;
  }

  emitToUser(notification.recipient, "notification:new", notification);
  await emitUnreadNotificationCount(notification.recipient);
};

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
    const notification = await createNotification(payload);
    await emitCreatedNotification(notification);
    return notification;
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

  const createdNotifications = await Notification.insertMany(docs, {
    ordered: false,
  });

  createdNotifications.forEach((notification) => {
    emitCreatedNotification(notification).catch((error) => {
      console.error("[Notification] Failed to emit notification", error);
    });
  });

  return createdNotifications;
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

  const createdNotifications = await Notification.insertMany(docs, {
    ordered: false,
  });

  createdNotifications.forEach((notification) => {
    emitCreatedNotification(notification).catch((error) => {
      console.error("[Notification] Failed to emit notification", error);
    });
  });

  return createdNotifications;
};

export const notifyUserIdsSafe = async (recipientIds, payload) => {
  try {
    return await notifyUserIds(recipientIds, payload);
  } catch (error) {
    console.error("[Notification] Failed to notify user ids", error);
    return [];
  }
};
