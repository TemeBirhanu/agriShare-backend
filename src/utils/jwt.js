import jwt from "jsonwebtoken";

const DEFAULT_TOKEN_EXPIRY = "7d";

const parseTokenExpiryToMs = (expiry = DEFAULT_TOKEN_EXPIRY) => {
  if (typeof expiry === "number") {
    return expiry * 1000;
  }

  const normalized = String(expiry).trim();
  const match = normalized.match(/^(\d+)([smhd])$/i);

  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
};

export const getAuthCookieName = () =>
  process.env.JWT_COOKIE_NAME || "accessToken";

export const getAuthCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const rawSameSite = (process.env.JWT_COOKIE_SAME_SITE || "lax").toLowerCase();
  const sameSite = ["lax", "strict", "none"].includes(rawSameSite)
    ? rawSameSite
    : "lax";
  const tokenExpiry = process.env.JWT_EXPIRES_IN || DEFAULT_TOKEN_EXPIRY;

  const options = {
    httpOnly: true,
    secure: isProduction,
    sameSite,
    path: "/",
    maxAge: parseTokenExpiryToMs(tokenExpiry),
  };

  if (process.env.JWT_COOKIE_DOMAIN) {
    options.domain = process.env.JWT_COOKIE_DOMAIN;
  }

  return options;
};

export const setAuthCookie = (res, token) => {
  res.cookie(getAuthCookieName(), token, getAuthCookieOptions());
};

export const clearAuthCookie = (res) => {
  const { maxAge, ...cookieOptions } = getAuthCookieOptions();

  res.clearCookie(getAuthCookieName(), {
    ...cookieOptions,
  });
};

export const generateToken = (user) => {
  const payload = {
    id: user._id,
    role: user.role,
    email: user.email,
  };
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || DEFAULT_TOKEN_EXPIRY,
  });
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
};

// module.exports = { generateToken, verifyToken };
