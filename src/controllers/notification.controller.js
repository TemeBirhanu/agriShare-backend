import Notification from "../models/Notification.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getMyNotifications = asyncHandler(async (req, res) => {
  const pageRaw = Number.parseInt(req.query.page, 10);
  const limitRaw = Number.parseInt(req.query.limit, 10);

  const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
  const limit = Number.isNaN(limitRaw)
    ? 20
    : Math.max(1, Math.min(limitRaw, 100));
  const skip = (page - 1) * limit;

  const query = { recipient: req.user._id };

  if (req.query.isRead !== undefined) {
    if (!["true", "false"].includes(String(req.query.isRead))) {
      throw new ApiError(400, 'isRead must be either "true" or "false"');
    }
    query.isRead = String(req.query.isRead) === "true";
  }

  if (req.query.type) {
    query.type = String(req.query.type).trim();
  }

  const [notifications, total] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(query),
  ]);

  return res.json(
    new ApiResponse(
      200,
      {
        notifications,
        pagination: {
          page,
          limit,
          total,
          totalPages: total > 0 ? Math.ceil(total / limit) : 0,
          hasMore: page * limit < total,
        },
      },
      "Notifications retrieved successfully",
    ),
  );
});

export const getUnreadNotificationCount = asyncHandler(async (req, res) => {
  const unreadCount = await Notification.countDocuments({
    recipient: req.user._id,
    isRead: false,
  });

  return res.json(
    new ApiResponse(
      200,
      { unreadCount },
      "Unread notification count retrieved successfully",
    ),
  );
});

export const markNotificationAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    {
      _id: req.params.id,
      recipient: req.user._id,
    },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
      },
    },
    { new: true },
  );

  if (!notification) {
    throw new ApiError(404, "Notification not found");
  }

  return res.json(
    new ApiResponse(200, { notification }, "Notification marked as read"),
  );
});

export const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { recipient: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );

  return res.json(
    new ApiResponse(
      200,
      { modifiedCount: result.modifiedCount || 0 },
      "All notifications marked as read",
    ),
  );
});

export const deleteNotification = asyncHandler(async (req, res) => {
  const deleted = await Notification.findOneAndDelete({
    _id: req.params.id,
    recipient: req.user._id,
  });

  if (!deleted) {
    throw new ApiError(404, "Notification not found");
  }

  return res.json(
    new ApiResponse(200, { deleted: true }, "Notification deleted"),
  );
});

export const clearMyNotifications = asyncHandler(async (req, res) => {
  const query = { recipient: req.user._id };

  if (req.query.isRead !== undefined) {
    if (!["true", "false"].includes(String(req.query.isRead))) {
      throw new ApiError(400, 'isRead must be either "true" or "false"');
    }
    query.isRead = String(req.query.isRead) === "true";
  }

  const result = await Notification.deleteMany(query);

  return res.json(
    new ApiResponse(
      200,
      { deletedCount: result.deletedCount || 0 },
      "Notifications cleared",
    ),
  );
});
