import express from "express";
import { getPlatformStats } from "../controllers/platformStats.controller.js";

const router = express.Router();

router.get("/stats", getPlatformStats);

export default router;