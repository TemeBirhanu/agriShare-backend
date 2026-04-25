import { ApiError } from "../utils/ApiError.js";

const DEFAULT_CHAPA_BASE_URL = "https://api.chapa.co/v1";

const getChapaConfig = () => {
  const secretKey = process.env.CHAPA_SECRET_KEY;
  if (!secretKey) {
    throw new ApiError(
      500,
      "CHAPA_SECRET_KEY is missing. Please configure payment credentials",
    );
  }

  return {
    baseUrl: process.env.CHAPA_BASE_URL || DEFAULT_CHAPA_BASE_URL,
    secretKey,
    callbackUrl: process.env.CHAPA_CALLBACK_URL || null,
    returnUrl: process.env.CHAPA_RETURN_URL || null,
    withdrawalEndpoint: process.env.CHAPA_WITHDRAWAL_ENDPOINT || "/transfers",
  };
};

const parseProviderPayload = async (response) => {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return {
    raw: text,
  };
};

const normalizeProviderMessage = (payload) => {
  if (!payload) {
    return "Payment provider request failed";
  }

  const candidate =
    payload.message || payload.detail || payload.error || payload;

  if (typeof candidate === "string") {
    return candidate;
  }

  if (Array.isArray(candidate)) {
    return candidate
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      })
      .join(" | ");
  }

  if (typeof candidate === "object") {
    const flatEntries = Object.entries(candidate).map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}: ${value.join(", ")}`;
      }
      if (typeof value === "object" && value !== null) {
        try {
          return `${key}: ${JSON.stringify(value)}`;
        } catch {
          return `${key}: ${String(value)}`;
        }
      }
      return `${key}: ${String(value)}`;
    });

    if (flatEntries.length > 0) {
      return flatEntries.join(" | ");
    }

    try {
      return JSON.stringify(candidate);
    } catch {
      return String(candidate);
    }
  }

  return String(candidate);
};

const chapaRequest = async ({ path, method = "GET", body = null }) => {
  const { baseUrl, secretKey } = getChapaConfig();

  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await parseProviderPayload(response);

  if (!response.ok) {
    const message = normalizeProviderMessage(payload);
    throw new ApiError(response.status, `Chapa error: ${message}`);
  }

  return payload;
};

export const generatePaymentTxRef = (type, userId) => {
  const normalizedType = String(type || "txn")
    .toUpperCase()
    .slice(0, 3);
  const uid = String(userId || "user").slice(-6);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `AGR-${normalizedType}-${uid}-${Date.now()}-${random}`;
};

export const initializeChapaDeposit = async ({
  amountBirr,
  txRef,
  user,
  callbackUrl,
  returnUrl,
}) => {
  const config = getChapaConfig();

  const effectiveCallbackUrl = callbackUrl || config.callbackUrl;
  const effectiveReturnUrl = returnUrl || config.returnUrl;

  if (!effectiveCallbackUrl || !effectiveReturnUrl) {
    throw new ApiError(
      400,
      "Both callbackUrl and returnUrl are required (or configure CHAPA_CALLBACK_URL and CHAPA_RETURN_URL)",
    );
  }

  const payload = {
    amount: String(amountBirr),
    currency: "ETB",
    email: user.email,
    first_name: user.firstName,
    last_name: user.lastName,
    phone_number: user.phone,
    tx_ref: txRef,
    callback_url: effectiveCallbackUrl,
    return_url: effectiveReturnUrl,
    "customization[title]": "AgriShare Wallet Deposit",
    "customization[description]": "Add funds to your AgriShare wallet",
    "meta[hide_receipt]": "false",
    "meta[payment_reason]": "Wallet top-up",
  };

  const response = await chapaRequest({
    path: "/transaction/initialize",
    method: "POST",
    body: payload,
  });

  return {
    response,
    checkoutUrl: response?.data?.checkout_url || null,
    providerReference:
      response?.data?.reference || response?.data?.id || response?.data?.tx_ref,
  };
};

export const verifyChapaTransaction = async (txRef) => {
  const response = await chapaRequest({
    path: `/transaction/verify/${encodeURIComponent(txRef)}`,
    method: "GET",
  });

  const paymentStatus = String(response?.data?.status || "").toLowerCase();
  const isSuccessful = ["success", "successful", "completed", "paid"].includes(
    paymentStatus,
  );

  return {
    response,
    paymentStatus,
    isSuccessful,
    providerReference:
      response?.data?.reference || response?.data?.id || response?.data?.tx_ref,
    failureReason: response?.message || response?.data?.status || null,
  };
};

export const initiateChapaBankWithdrawal = async ({
  txRef,
  amountBirr,
  accountName,
  accountNumber,
  bankCode,
  bankName,
  narration,
  user,
}) => {
  const config = getChapaConfig();

  const normalizedBankCode = /^\d+$/.test(String(bankCode || "").trim())
    ? Number(bankCode)
    : String(bankCode || "").trim();

  const payload = {
    account_name: accountName,
    account_number: accountNumber,
    amount: String(amountBirr),
    currency: "ETB",
    reference: txRef,
    bank_code: normalizedBankCode,
    narration:
      narration ||
      `AgriShare wallet withdrawal${bankName ? ` (${bankName})` : ""}`,
  };

  const response = await chapaRequest({
    path: config.withdrawalEndpoint,
    method: "POST",
    body: payload,
  });

  const normalizedStatus = String(
    response?.status || response?.data?.status || "",
  ).toLowerCase();

  const isSuccessful = ["success", "successful", "completed", "paid"].includes(
    normalizedStatus,
  );
  const isProcessing = ["processing", "pending", "queued"].includes(
    normalizedStatus,
  );

  return {
    response,
    isSuccessful,
    isProcessing,
    status: normalizedStatus || "unknown",
    providerReference:
      response?.data?.reference || response?.data?.id || response?.reference,
    failureReason: response?.message || null,
  };
};

export const verifyChapaTransfer = async (txRef) => {
  const response = await chapaRequest({
    path: `/transfers/verify/${encodeURIComponent(txRef)}`,
    method: "GET",
  });

  const transferStatus = String(
    response?.status || response?.data?.status || "",
  ).toLowerCase();

  const isSuccessful = ["success", "successful", "completed", "paid"].includes(
    transferStatus,
  );
  const isProcessing = ["processing", "pending", "queued"].includes(
    transferStatus,
  );

  return {
    response,
    transferStatus,
    isSuccessful,
    isProcessing,
    providerReference:
      response?.data?.reference || response?.data?.id || response?.reference,
    failureReason: response?.message || response?.data?.status || null,
  };
};

export const verifyChapaWebhookSignature = (req) => {
  const configuredSecret = process.env.CHAPA_WEBHOOK_SECRET;
  if (!configuredSecret) {
    return true;
  }

  const signature =
    req.headers["x-chapa-signature"] || req.headers["chapa-signature"];

  return String(signature || "") === String(configuredSecret);
};
