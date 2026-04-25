import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";

dotenv.config();

import connectDB from "./config/db.config.js";
import authRoutes from "./routes/auth.routes.js";
import errorHandler from "./middlewares/error.middleware.js";
import userRoutes from "./routes/user.routes.js";
import assetRoutes from "./routes/asset.routes.js";
import listingRoutes from "./routes/listing.routes.js";
import investmentRoutes from "./routes/investment.routes.js";
import distributionRoutes from "./routes/distribution.routes.js";
import creditsRoutes from "./routes/credits.routes.js";
import farmerVerificationRoutes from "./routes/farmerVerification.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import { startFundingLifecycleScheduler } from "./services/scheduler.service.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Security & logging middleware
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/assets", assetRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api/investments", investmentRoutes);
app.use("/api/distributions", distributionRoutes);
app.use("/api/credits", creditsRoutes);
app.use("/api/farmer-verifications", farmerVerificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payments", paymentRoutes);

// Health check
app.get("/", (req, res) => {
  res.json({
    message: "🚀 AgriShare Backend is running!",
    version: "1.0.0",
    blockchain: "Polygon Amoy Testnet (ready)",
  });
});

app.get("/health", (req, res) => res.json({ status: "OK" }));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Global error handler
app.use(errorHandler);

const startServer = async () => {
  await connectDB();
  startFundingLifecycleScheduler();
  app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  });
};

startServer();
