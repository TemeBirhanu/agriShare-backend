import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import User from "../models/User.js";

let socketServer;

const getUserRoom = (userId) => `user:${userId}`;

const getTokenFromSocket = (socket) => {
  const authToken = socket.handshake.auth?.token;
  if (authToken) {
    return authToken;
  }

  const authorizationHeader = socket.handshake.headers?.authorization;
  if (authorizationHeader?.startsWith("Bearer ")) {
    return authorizationHeader.slice(7);
  }

  const queryToken = socket.handshake.query?.token;
  if (typeof queryToken === "string" && queryToken.trim()) {
    return queryToken.trim();
  }

  return null;
};

const parseSocketCorsOrigins = (corsOrigins) => {
  if (Array.isArray(corsOrigins) && corsOrigins.length > 0) {
    return corsOrigins;
  }

  return true;
};

export const initializeSocketServer = (httpServer, { corsOrigins } = {}) => {
  socketServer = new Server(httpServer, {
    cors: {
      origin: parseSocketCorsOrigins(corsOrigins),
      credentials: true,
    },
  });

  socketServer.use(async (socket, next) => {
    try {
      const token = getTokenFromSocket(socket);
      if (!token) {
        return next(new Error("Not authorized - no token provided"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("_id role isActive");

      if (!user) {
        return next(new Error("User not found"));
      }

      if (!user.isActive) {
        return next(new Error("Account is inactive. Please contact support"));
      }

      socket.data.user = {
        id: String(user._id),
        role: user.role,
      };

      return next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return next(new Error("Token has expired"));
      }

      return next(new Error("Not authorized - invalid token"));
    }
  });

  socketServer.on("connection", (socket) => {
    const userId = socket.data.user?.id;
    if (userId) {
      socket.join(getUserRoom(userId));
    }

    socket.emit("notifications:connected", {
      userId,
      connected: true,
    });
  });

  return socketServer;
};

export const getSocketServer = () => socketServer;

export const closeSocketServer = async () => {
  if (!socketServer) {
    return;
  }

  await new Promise((resolve) => {
    socketServer.close(() => resolve());
  });

  socketServer = null;
};

export const emitToUser = (userId, eventName, payload) => {
  if (!socketServer || !userId) {
    return false;
  }

  socketServer.to(getUserRoom(userId)).emit(eventName, payload);
  return true;
};

export const emitToUsers = (userIds, eventName, payload) => {
  const uniqueUserIds = [...new Set((userIds || []).map(String))].filter(
    Boolean,
  );

  if (!socketServer || uniqueUserIds.length === 0) {
    return false;
  }

  uniqueUserIds.forEach((userId) => {
    socketServer.to(getUserRoom(userId)).emit(eventName, payload);
  });

  return true;
};
