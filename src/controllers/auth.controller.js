const { ApiError } = require("../utils/ApiError");
const { ApiResponse } = require("../utils/ApiResponse");
const User = require("../models/User");
const { generateToken } = require("../utils/jwt");
const asyncHandler = require("../utils/asyncHandler").asyncHandler;

const register = asyncHandler(async (req, res) => {
  const { fullName, phone, email, password, role, nationalId } = req.body;

  if (!fullName || !phone || !email || !password) {
    throw new ApiError(
      400,
      "Full name, phone, email and password are required",
    );
  }

  const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
  if (existingUser) {
    throw new ApiError(400, "Email or phone number already in use");
  }

  const user = await User.create({
    fullName,
    phone,
    email,
    password,
    role: role || "investor",
    nationalId: role === "farmer" ? nationalId : undefined,
  });

  const token = generateToken(user);

  const userData = {
    id: user._id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { token, user: userData },
        "User registered successfully",
      ),
    );
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    throw new ApiError(401, "Invalid credentials");
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, "Invalid credentials");
  }

  const token = generateToken(user);

  const userData = {
    id: user._id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };

  return res.json(
    new ApiResponse(200, { token, user: userData }, "Login successful"),
  );
});

module.exports = { register, login };
