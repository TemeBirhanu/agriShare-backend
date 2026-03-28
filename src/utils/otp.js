import crypto from "crypto";

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 10;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

const getOtpSalt = () =>
  process.env.OTP_SECRET || process.env.JWT_SECRET || "change-otp-secret";

export const generateNumericOtp = (digits = OTP_LENGTH) => {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits;

  return String(crypto.randomInt(min, max));
};

export const getOtpExpiryDate = (minutes = OTP_EXPIRY_MINUTES) =>
  new Date(Date.now() + minutes * 60 * 1000);

export const hashEmailOtp = (email, otpCode) => {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const normalizedOtpCode = String(otpCode || "").trim();

  return crypto
    .createHash("sha256")
    .update(`${normalizedEmail}:${normalizedOtpCode}:${getOtpSalt()}`)
    .digest("hex");
};
