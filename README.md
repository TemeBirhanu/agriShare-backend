# AgriShare Backend

**Blockchain-based Farmland & Livestock Tokenization Platform**  
Farmers tokenize yield rights → Investors buy fractional shares → Fiat payments only (Telebirr/Chapa)

**Tech Stack**  
Node.js + Express + MongoDB + Ethers.js + Hardhat + JWT

## Quick Start

```bash
npm install
cp .env.example .env
# Fill MONGO_URI and PRIVATE_KEY
npm run dev
```

## Listing Update Timeline API

Farmers can publish chronological listing updates (title, body, images, posted date) that are visible to all authenticated users.

### Behavior

- A first update is posted automatically when a listing is created:
  - `title`: `Listing launched for investment`
  - `body`: `Listing launched for investment`
- Any authenticated user can read updates.
- Only the listing owner farmer can create, edit, or delete updates.
- Farmers can create updates even after payday.
- Farmers can edit/delete updates only before payday.
- Maximum 3 images per update.

### Endpoints

#### 1) Create update (farmer only)

- **POST** `/api/listings/:id/updates`
- Auth: `Bearer <token>`
- Content-Type: `multipart/form-data`
- Fields:
  - `title` (required, 5-120 chars)
  - `body` (required, 20-3000 chars)
  - `images` (optional, up to 3 files)

#### 2) Get updates (all authenticated users)

- **GET** `/api/listings/:id/updates?page=1&limit=10`
- Auth: `Bearer <token>`
- Returns chronological order by `postedAt` ascending.

#### 3) Edit update (farmer owner only, before payday)

- **PATCH** `/api/listings/:id/updates/:updateId`
- Auth: `Bearer <token>`
- Content-Type: `multipart/form-data`
- Optional fields: `title`, `body`, `images` (replaces existing images if provided)

#### 4) Delete update (farmer owner only, before payday)

- **DELETE** `/api/listings/:id/updates/:updateId`
- Auth: `Bearer <token>`

---

## Listing Reviews API

Investors who have purchased shares in a listing can post one text review per listing. All authenticated users can read reviews.

### Behavior

- Only investors who hold an investment contract for the listing can post a review.
- Each investor is limited to **one review per listing**. Attempting to submit a second review returns `409 Conflict`.
- Investors can edit and delete only their own reviews.
- Reviews are returned in **chronological order** (oldest first) with page-based pagination.
- Any authenticated user (farmer, investor, admin) can read reviews.

### Endpoints

#### 1) Post a review (investor only – must have invested)

- **POST** `/api/listings/:id/reviews`
- Auth: `Bearer <token>` (investor role required)
- Content-Type: `application/json`
- Body:
  ```json
  {
    "body": "I invested in this farmland because the soil quality reports were impressive and the farmer has a strong track record."
  }
  ```
- Success `201`:
  ```json
  {
    "statusCode": 201,
    "data": {
      "review": {
        "_id": "<reviewId>",
        "listing": "<listingId>",
        "investor": {
          "_id": "<userId>",
          "fullName": "Abebe Kebede",
          "profilePicture": null
        },
        "body": "I invested in this farmland because ...",
        "createdAt": "2026-03-21T10:00:00.000Z",
        "updatedAt": "2026-03-21T10:00:00.000Z"
      }
    },
    "message": "Review posted successfully"
  }
  ```

#### 2) Get reviews for a listing (all authenticated users)

- **GET** `/api/listings/:id/reviews?page=1&limit=10`
- Auth: `Bearer <token>`
- Query params: `page` (default 1), `limit` (default 10, max 50)
- Returns reviews in chronological order (oldest first).
- Success `200`:
  ```json
  {
    "statusCode": 200,
    "data": {
      "reviews": [
        {
          "_id": "<reviewId>",
          "listing": "<listingId>",
          "investor": {
            "_id": "<userId>",
            "fullName": "Abebe Kebede",
            "profilePicture": null
          },
          "body": "I invested in this farmland because ...",
          "createdAt": "2026-03-21T10:00:00.000Z",
          "updatedAt": "2026-03-21T10:00:00.000Z"
        }
      ],
      "pagination": {
        "page": 1,
        "limit": 10,
        "total": 1,
        "totalPages": 1,
        "hasMore": false
      }
    },
    "message": "Reviews retrieved successfully"
  }
  ```

#### 3) Edit a review (investor owner only)

- **PATCH** `/api/listings/:id/reviews/:reviewId`
- Auth: `Bearer <token>` (must be the investor who created the review)
- Content-Type: `application/json`
- Body:
  ```json
  {
    "body": "Updated review: after receiving my first yield distribution I am even more confident in this investment."
  }
  ```
- Success `200`:
  ```json
  {
    "statusCode": 200,
    "data": {
      "review": {
        "_id": "<reviewId>",
        "body": "Updated review: ...",
        "updatedAt": "2026-03-21T11:00:00.000Z"
      }
    },
    "message": "Review updated successfully"
  }
  ```

#### 4) Delete a review (investor owner only)

- **DELETE** `/api/listings/:id/reviews/:reviewId`
- Auth: `Bearer <token>` (must be the investor who created the review)
- Success `200`:
  ```json
  {
    "statusCode": 200,
    "data": { "deleted": true },
    "message": "Review deleted successfully"
  }
  ```

### Error Responses

| Status | Message                                                |
| ------ | ------------------------------------------------------ |
| `403`  | Only investors can post reviews                        |
| `403`  | You can only review listings that you have invested in |
| `403`  | You can only edit/delete your own reviews              |
| `404`  | Listing not found                                      |
| `404`  | Review not found                                       |
| `409`  | You have already submitted a review for this listing   |

---

## In-App Notifications

The backend includes a modular in-app notification system for farmer, investor, and admin users.

### Current Notification Triggers

- Farmer Fayda verification submitted -> notify admins.
- Farmer Fayda verification reviewed -> notify farmer (approved/rejected with reason).
- Asset submitted for verification -> notify admins.
- Asset verification reviewed -> notify farmer (verified/rejected with reason/comment).
- AgriCredits monthly grant -> notify user with deposited amount.
- AgriCredits signup bonus -> notify user.
- AgriCredits bundle purchase -> notify user with bundle and balance summary.
- Farmer gets notified on every share sale in
- Farmer gets a congratulatory notification when the investment goal is reached
- All investors of a listing get notified when the farmer posts a new update
- Added the unread-count endpoint for badge display.

### Notification API Endpoints

- GET `/api/users/me/notifications?page=1&limit=20&isRead=false&type=credit_grant`
- PATCH `/api/users/me/notifications/read-all`
- PATCH `/api/users/me/notifications/:id/read`
- DELETE `/api/users/me/notifications/:id`
- DELETE `/api/users/me/notifications/clear`
- DELETE `/api/users/me/notifications/clear?isRead=true`
- GET `/api/users/me/notifications/unread-count`

Added the unread-count endpoint for badge display in the frontend ui. its response is as follows:

```bash
{
  "statusCode": 200,
  "data": {
    "unreadCount": 5
  },
  "message": "Unread notification count retrieved successfully",
  "success": true
}
```

All notification endpoints require bearer token authentication.

---

## Admin API

Admin dashboard and operations endpoints are available under `/api/admin`.

### Notes on Behavior

- All admin endpoints require `Authorization: Bearer <token>` with `admin` role.
- Non-admin users receive `403 Access denied`.
- Analytics endpoints accept flexible date-window query params:
  - `days` (default `30`)
  - `startDate` and `endDate` (ISO date-time)
  - If `startDate > endDate`, the backend swaps them automatically.
- Queue endpoints support pagination:
  - `page` (default `1`)
  - `limit` (default `20`, max `100`)
- Listing risk queue supports filter query params:
  - `daysWindow` (default `10`)
  - `maxFundingProgressPercent` (default `80`, max `100`)
- Refund operation endpoint wraps the platform refund service and supports:
  - `force` (default `true`)
  - `reason` (optional audit reason)

### Base URL

`http://localhost:5000/api/admin`

### Postman Header Example

```http
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json
```

### Endpoints

#### 1) Dashboard overview

- **GET** `/dashboard/overview`

Sample response `200`:

```json
{
  "statusCode": 200,
  "data": {
    "users": {
      "total": 140,
      "active": 132,
      "inactive": 8,
      "farmers": 62,
      "investors": 75,
      "admins": 3
    },
    "queues": {
      "pendingFarmerVerifications": 9,
      "pendingAssets": 14
    },
    "listings": {
      "active": 20,
      "funded": 5,
      "completed": 17,
      "cancelled": 1,
      "failed": 2,
      "refunded": 4
    },
    "investments": {
      "totalContracts": 401,
      "activeContracts": 112,
      "completedContracts": 245,
      "refundedContracts": 44,
      "grossInvestmentBirr": 12150000,
      "refundedAmountBirr": 955000
    },
    "notifications": {
      "unread": 58
    },
    "generatedAt": "2026-04-07T10:30:00.000Z"
  },
  "message": "Admin overview retrieved",
  "success": true
}
```

#### 2) Verification queue

- **GET** `/queues/verifications?page=1&limit=20`

Sample response `200`:

```json
{
  "statusCode": 200,
  "data": {
    "total": 9,
    "page": 1,
    "limit": 20,
    "hasNextPage": false,
    "items": [
      {
        "_id": "6612f2ca40b23ed56f23a9ac",
        "status": "pending",
        "faydaIdNumber": "FAYDA-112233",
        "submittedAt": "2026-04-02T09:10:00.000Z",
        "user": {
          "_id": "6612f19140b23ed56f23a990",
          "firstName": "Abebe",
          "lastName": "Kebede",
          "email": "abebe@example.com",
          "phone": "+251900000001",
          "region": "Amhara",
          "zone": "East Gojjam",
          "woreda": "Debre Elias",
          "kebele": "01"
        }
      }
    ]
  },
  "message": "Pending farmer verification queue retrieved",
  "success": true
}
```

#### 3) Asset queue

- **GET** `/queues/assets?page=1&limit=20`

Sample response `200`:

```json
{
  "statusCode": 200,
  "data": {
    "total": 14,
    "page": 1,
    "limit": 20,
    "hasNextPage": false,
    "items": [
      {
        "_id": "6612f4d040b23ed56f23aa10",
        "type": "farmland",
        "name": "Teff Plot - Gozamin",
        "status": "pending",
        "createdAt": "2026-04-03T12:30:00.000Z",
        "farmer": {
          "_id": "6612f19140b23ed56f23a990",
          "firstName": "Abebe",
          "lastName": "Kebede",
          "email": "abebe@example.com",
          "phone": "+251900000001"
        }
      }
    ]
  },
  "message": "Pending asset verification queue retrieved",
  "success": true
}
```

#### 4) Listing risk queue

- **GET** `/queues/listings-risk?page=1&limit=20&daysWindow=10&maxFundingProgressPercent=80`

Sample response `200`:

```json
{
  "statusCode": 200,
  "data": {
    "total": 3,
    "page": 1,
    "limit": 20,
    "filters": {
      "daysWindow": 10,
      "maxFundingProgressPercent": 80
    },
    "hasNextPage": false,
    "items": [
      {
        "_id": "6612f70a40b23ed56f23abc0",
        "status": "active",
        "investmentGoalBirr": 500000,
        "totalInvestedBirr": 160000,
        "investmentDeadline": "2026-04-12T00:00:00.000Z",
        "payoutMode": "fixed",
        "fundingProgressPercent": 32,
        "farmer": {
          "_id": "6612f19140b23ed56f23a990",
          "firstName": "Abebe",
          "lastName": "Kebede",
          "email": "abebe@example.com",
          "phone": "+251900000001"
        }
      }
    ]
  },
  "message": "Listing risk queue retrieved",
  "success": true
}
```

#### 5) Investment analytics

- **GET** `/analytics/investments?days=30`

Sample response `200`:

```json
{
  "statusCode": 200,
  "data": {
    "window": {
      "startDate": "2026-03-08T10:30:00.000Z",
      "endDate": "2026-04-07T10:30:00.000Z",
      "days": 30
    },
    "summary": {
      "contractCount": 86,
      "totalInvestedBirr": 2750000,
      "uniqueInvestorCount": 41,
      "averageTicketBirr": 31976.74
    },
    "byDay": [
      {
        "date": "2026-04-05",
        "contractCount": 4,
        "totalInvestedBirr": 122000
      }
    ],
    "topListings": [
      {
        "listingId": "6612f70a40b23ed56f23abc0",
        "contractCount": 16,
        "totalInvestedBirr": 600000,
        "status": "funded",
        "investmentGoalBirr": 500000,
        "totalInvestedListingBirr": 520000
      }
    ]
  },
  "message": "Investment analytics retrieved",
  "success": true
}
```

#### 6) Distribution analytics

- **GET** `/analytics/distributions?days=30`

Sample response `200`:

```json
{
  "statusCode": 200,
  "data": {
    "window": {
      "startDate": "2026-03-08T10:30:00.000Z",
      "endDate": "2026-04-07T10:30:00.000Z",
      "days": 30
    },
    "summary": {
      "activeContracts": 112,
      "completedContracts": 245,
      "refundedContracts": 44,
      "completedContractValueBirr": 7600000,
      "refundedContractValueBirr": 955000,
      "refundedListings": 4,
      "investorPayoutBirr": 420000
    }
  },
  "message": "Distribution analytics retrieved",
  "success": true
}
```

#### 7) Credits analytics

- **GET** `/analytics/credits?days=30`

Sample response `200`:

```json
{
  "statusCode": 200,
  "data": {
    "window": {
      "startDate": "2026-03-08T10:30:00.000Z",
      "endDate": "2026-04-07T10:30:00.000Z",
      "days": 30
    },
    "summary": {
      "transactionCount": 210,
      "totalAbsoluteVolume": 1540,
      "positiveCredits": 980,
      "negativeCredits": 560
    },
    "byType": [
      {
        "type": "monthly_reset",
        "transactionCount": 62,
        "totalAmount": 620,
        "absoluteVolume": 620
      }
    ],
    "byDay": [
      {
        "date": "2026-04-05",
        "transactionCount": 13,
        "absoluteVolume": 75
      }
    ]
  },
  "message": "AgriCredits analytics retrieved",
  "success": true
}
```

#### 8) Manual refund operation

- **POST** `/operations/refunds/:listingId`

Sample request body:

```json
{
  "force": true,
  "reason": "admin_manual_refund_after_dispute"
}
```

Sample response `200`:

```json
{
  "statusCode": 200,
  "data": {
    "refund": {
      "refunded": true,
      "listingId": "6612f70a40b23ed56f23abc0",
      "refundedContractCount": 21,
      "refundedAmountBirr": 312500,
      "investorCount": 14,
      "reason": "admin_manual_refund_after_dispute"
    }
  },
  "message": "Refund operation completed",
  "success": true
}
```

### Common Error Examples

```json
{
  "statusCode": 403,
  "message": "Access denied. Only admin can access this resource",
  "success": false
}
```

```json
{
  "statusCode": 400,
  "message": "Invalid listingId",
  "success": false
}
```

---

## Investor Refund Request API

Investor refund requests are available under `/api/investments`.

### Notes on Behavior

- Investor can submit refund request only if listing status is `active`.
- Investor must have at least one `active` or `disputed` contract on that listing.
- Only one `pending` request per investor per listing is allowed.
- Admin can review request as `approved` or `rejected`.
- On approval, refund settlement happens immediately:
  - Investor `walletBalance` is credited.
  - Farmer `fundWalletBalance` is debited.
  - Related investor contracts become `refunded`.
  - Investor share ownership becomes `refunded` and shares become `0`.
  - Listing `totalInvestedBirr` is reduced by refunded amount.

### Base URL

`http://localhost:5000/api/investments`

### Postman Header Example

```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Investor Endpoints

#### 1) Submit refund request (investor)

- **POST** `/refund-requests`
- Auth: `Bearer <investor_jwt_token>` (verified investor)

Sample request body:

```json
{
  "listingId": "6801d7f0e6f0b7f6bf232111",
  "reason": "I need early liquidity"
}
```

Sample response `201`:

```json
{
  "statusCode": 201,
  "data": {
    "refundRequest": {
      "_id": "6801dc3ce6f0b7f6bf232145",
      "listing": "6801d7f0e6f0b7f6bf232111",
      "investor": "6801baf1e6f0b7f6bf232001",
      "farmer": "6801bb49e6f0b7f6bf23200a",
      "status": "pending",
      "investorReason": "I need early liquidity",
      "requestedAmountBirr": 15000,
      "requestedShares": 3,
      "requestedContractCount": 1,
      "requestedAt": "2026-04-18T10:20:00.000Z"
    }
  },
  "message": "Refund request submitted and pending admin review",
  "success": true
}
```

#### 2) Get my refund requests (investor)

- **GET** `/my-refund-requests?status=all&page=1&limit=20`
- Auth: `Bearer <investor_jwt_token>` (verified investor)
- `status` can be: `pending`, `approved`, `rejected`, or `all`.

Sample response `200`:

```json
{
  "statusCode": 200,
  "data": {
    "refundRequests": [
      {
        "_id": "6801dc3ce6f0b7f6bf232145",
        "status": "pending",
        "requestedAmountBirr": 15000,
        "listing": {
          "_id": "6801d7f0e6f0b7f6bf232111",
          "status": "active",
          "investmentGoalBirr": 500000,
          "totalInvestedBirr": 175000
        },
        "reviewedBy": null
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "hasNextPage": false
  },
  "message": "Refund requests retrieved successfully",
  "success": true
}
```

### Admin Endpoints

#### 1) List refund requests (admin)

- **GET** `/admin/refund-requests?status=pending&page=1&limit=20`
- Auth: `Bearer <admin_jwt_token>`
- `status` can be: `pending`, `approved`, `rejected`, or `all`.

Sample response `200`:

```json
{
  "statusCode": 200,
  "data": {
    "refundRequests": [
      {
        "_id": "6801dc3ce6f0b7f6bf232145",
        "status": "pending",
        "requestedAmountBirr": 15000,
        "requestedShares": 3,
        "requestedContractCount": 1,
        "investor": {
          "_id": "6801baf1e6f0b7f6bf232001",
          "firstName": "Bekele",
          "lastName": "Tadesse",
          "email": "bekele@example.com",
          "phone": "+251900000001"
        },
        "farmer": {
          "_id": "6801bb49e6f0b7f6bf23200a",
          "firstName": "Abebe",
          "lastName": "Kebede",
          "email": "abebe@example.com",
          "phone": "+251900000010"
        },
        "listing": {
          "_id": "6801d7f0e6f0b7f6bf232111",
          "status": "active",
          "pitchTitle": "Irrigated Teff Expansion",
          "investmentGoalBirr": 500000,
          "totalInvestedBirr": 175000
        }
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "hasNextPage": false
  },
  "message": "Investor refund requests retrieved",
  "success": true
}
```

#### 2) Review refund request (admin)

- **PATCH** `/admin/refund-requests/:id/review`
- Auth: `Bearer <admin_jwt_token>`
- `status` must be `approved` or `rejected`.

Sample approve request body:

```json
{
  "status": "approved",
  "adminNote": "Approved after review"
}
```

Sample reject request body:

```json
{
  "status": "rejected",
  "adminNote": "Not eligible at this time"
}
```

Sample response `200` for approve:

```json
{
  "statusCode": 200,
  "data": {
    "refundRequest": {
      "_id": "6801dc3ce6f0b7f6bf232145",
      "status": "approved",
      "refundedAmountBirr": 15000,
      "refundedShares": 3,
      "refundedContractCount": 1
    },
    "settlement": {
      "requestId": "6801dc3ce6f0b7f6bf232145",
      "listingId": "6801d7f0e6f0b7f6bf232111",
      "investorId": "6801baf1e6f0b7f6bf232001",
      "farmerId": "6801bb49e6f0b7f6bf23200a",
      "refundedAmountBirr": 15000,
      "refundedShares": 3,
      "refundedContractCount": 1,
      "listingTotalInvestedBirr": 160000
    }
  },
  "message": "Refund request approved and settled",
  "success": true
}
```

Sample response `200` for reject:

```json
{
  "statusCode": 200,
  "data": {
    "refundRequest": {
      "_id": "6801dc3ce6f0b7f6bf232145",
      "status": "rejected",
      "adminNote": "Not eligible at this time"
    }
  },
  "message": "Refund request rejected",
  "success": true
}
```

### Common Error Examples

```json
{
  "statusCode": 400,
  "message": "Refund request can only be submitted while listing is active",
  "success": false
}
```

```json
{
  "statusCode": 409,
  "message": "You already have a pending refund request for this listing",
  "success": false
}
```

```json
{
  "statusCode": 409,
  "message": "Farmer fund wallet balance is insufficient for investor refund",
  "success": false
}
```

---

## Wallet Payments API (Chapa)

This module enables users to deposit to wallet and withdraw to bank account.

### Behavior

- Provider in v1: **Chapa** only.
- Currency in v1: **ETB**.
- Deposit is credited to `walletBalance` only after successful provider verification.
- Webhook processing is idempotent (repeated callbacks will not double-credit).
- Withdrawal is auto-processed in v1 (no manual admin approval).
- On withdrawal failure, wallet is automatically restored.

### Base URL

`http://localhost:5000/api/payments`

### Endpoints

#### 1) Initiate deposit

- **POST** `/deposits/initiate`
- Auth: `Bearer <user_jwt_token>`

Request body:

```json
{
  "amountBirr": 1500,
  "callbackUrl": "http://localhost:5000/api/payments/webhook/chapa",
  "returnUrl": "http://localhost:3000/wallet/result"
}
```

Sample success response `201`:

```json
{
  "statusCode": 201,
  "data": {
    "payment": {
      "_id": "680b4f9a3d1df2f417f0a101",
      "type": "deposit",
      "provider": "chapa",
      "txRef": "AGR-DEP-12ABCD-1778000000000-X1Y2Z3",
      "status": "pending",
      "amountBirr": 1500,
      "currency": "ETB"
    },
    "checkoutUrl": "https://checkout.chapa.co/checkout/payment/abc123"
  },
  "message": "Deposit initiated successfully",
  "success": true
}
```

#### 2) Verify deposit by txRef

- **GET** `/deposits/verify/:txRef`
- Auth: `Bearer <user_jwt_token>`

Sample success response `200`:

```json
{
  "statusCode": 200,
  "data": {
    "payment": {
      "_id": "680b4f9a3d1df2f417f0a101",
      "status": "successful",
      "txRef": "AGR-DEP-12ABCD-1778000000000-X1Y2Z3",
      "settledAt": "2026-04-25T08:13:00.000Z"
    },
    "walletBalance": 5500,
    "alreadySettled": false
  },
  "message": "Deposit verified successfully",
  "success": true
}
```

#### 3) Chapa webhook callback

- **POST** `/webhook/chapa`
- Auth: none (provider callback)
- Optional signature header if configured:
  - `x-chapa-signature: <CHAPA_WEBHOOK_SECRET>`

Sample webhook body:

```json
{
  "tx_ref": "AGR-DEP-12ABCD-1778000000000-X1Y2Z3"
}
```

#### 4) Request bank withdrawal

- **POST** `/withdrawals/request`
- Auth: `Bearer <user_jwt_token>`

Request body:

```json
{
  "amountBirr": 1000,
  "accountName": "Abebe Kebede",
  "accountNumber": "1000123456789",
  "bankCode": "CBE",
  "bankName": "Commercial Bank of Ethiopia",
  "narration": "Wallet withdrawal"
}
```

Sample success response `201`:

```json
{
  "statusCode": 201,
  "data": {
    "payment": {
      "_id": "680b51ba3d1df2f417f0a111",
      "type": "withdrawal",
      "status": "successful",
      "amountBirr": 1000,
      "txRef": "AGR-WIT-12ABCD-1778000000000-Q1W2E3"
    },
    "walletBalance": 4500
  },
  "message": "Withdrawal processed successfully",
  "success": true
}
```

#### 5) My payment transactions

- **GET** `/me/transactions?page=1&limit=20&type=all&status=all`
- Auth: `Bearer <user_jwt_token>`

#### 6) Admin payment transactions

- **GET** `/admin/transactions?page=1&limit=20&type=all&status=all`
- Auth: `Bearer <admin_jwt_token>`

### Common Errors

```json
{
  "statusCode": 400,
  "message": "amountBirr must be a positive number",
  "success": false
}
```

```json
{
  "statusCode": 400,
  "message": "Insufficient wallet balance for withdrawal",
  "success": false
}
```

```json
{
  "statusCode": 401,
  "message": "Invalid webhook signature",
  "success": false
}
```
