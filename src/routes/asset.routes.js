const express = require("express");
const router = express.Router();

const { protect, restrictTo } = require("../middlewares/auth.middleware");
const { createAsset } = require("../controllers/asset.controller");
const asyncHandler = require("../utils/asyncHandler").asyncHandler;

router.post("/", protect, restrictTo("farmer"), asyncHandler(createAsset));

module.exports = router;
