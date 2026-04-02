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
