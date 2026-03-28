import nodemailer from "nodemailer";

let smtpTransporter;

const getMissingSmtpKeys = () => {
  const requiredKeys = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
  ];

  return requiredKeys.filter((key) => !process.env[key]);
};

const getSmtpTransporter = () => {
  const missingKeys = getMissingSmtpKeys();
  if (missingKeys.length > 0) {
    throw new Error(
      `SMTP configuration is incomplete. Missing: ${missingKeys.join(", ")}`,
    );
  }

  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure:
        String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return smtpTransporter;
};

export const sendInvestorVerificationOtpEmail = async ({
  to,
  firstName,
  otpCode,
  expiresInMinutes,
}) => {
  const appName = "AgriShare";
  const displayName = String(firstName || "Investor").trim();

  const text = [
    `Hi ${displayName},`,
    "",
    `Your ${appName} email verification code is: ${otpCode}`,
    `This code expires in ${expiresInMinutes} minutes.`,
    "",
    "If you did not request this code, you can ignore this email.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="margin-bottom: 12px;">Verify Your ${appName} Account</h2>
      <p>Hi ${displayName},</p>
      <p>Your verification code is:</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 8px; margin: 16px 0;">${otpCode}</p>
      <p>This code expires in <strong>${expiresInMinutes} minutes</strong>.</p>
      <p>If you did not request this code, you can ignore this email.</p>
    </div>
  `;

  return getSmtpTransporter().sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: `${appName} email verification code`,
    text,
    html,
  });
};
