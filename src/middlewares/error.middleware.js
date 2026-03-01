const { ApiError } = require("../utils/ApiError");
const { ApiResponse } = require("../utils/ApiResponse");

const errorHandler = (err, req, res, next) => {
  // If it's already our ApiError → use it
  if (err instanceof ApiError) {
    return res
      .status(err.statusCode)
      .json(new ApiResponse(err.statusCode, null, err.message));
  }

  // Otherwise → wrap unknown errors
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);

  return res
    .status(statusCode)
    .json(new ApiResponse(statusCode, null, message));
};

module.exports = errorHandler;
