# Double H Studio — rebuild (React + Node.js)

One project, four parts: brand identity (Part A), React frontend + Node backend (Part B),
Production/Social video types (Part C), private admin dashboard (Part D).

```
double-h-studio/
  client/   React 18 + Vite + React Router (public site + /admin UI)
  server/   Node.js + Express REST API (/api), PostgreSQL + Prisma
  legacy/   Previous HTML/CSS/JS site, frozen for reference until sign-off
```

## Prerequisites

- Node.js 20+
- Docker Desktop **running** (for local PostgreSQL), or a `DATABASE_URL` of your own
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` for the seeded admin (min 10 chars)

## Run (development)

```bash
# 1. Database
docker compose up -d db

# 2. Backend
cd server
cp .env.example .env        # set ADMIN_EMAIL / ADMIN_PASSWORD at minimum
npm install
npx prisma migrate dev      # creates tables
npm run seed                # seeds the admin + default settings
npm run dev                 # http://localhost:3100  (API under /api)

# 3. Frontend (Stage: React shell — coming next)
cd ../client
npm install
npm run dev                 # http://localhost:5173 (proxies /api to :3100)
```

## Production notes

- `server/.env` holds all secrets (see `server/.env.example`). Never commit it.
- Run migrations with `npx prisma migrate deploy`.
- One-shot import of the legacy SQLite data: `npm run import:legacy` (server).
