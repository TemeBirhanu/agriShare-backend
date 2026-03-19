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
