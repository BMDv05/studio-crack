# Server — Double H Studio API

Express + PostgreSQL (Prisma) REST API under `/api`.

## Setup

```bash
cp .env.example .env   # adjust ADMIN_EMAIL / ADMIN_PASSWORD
npm install
npx prisma migrate dev # create tables (needs the DB from `docker compose up -d db`)
npm run seed           # admin + default settings (idempotent)
npm run dev            # http://localhost:3100
```

## Layout

- `src/index.js` — boot (seed admin, listen)
- `src/app.js` — helmet, CORS (frontend origin only), JSON, routes, errors
- `src/config.js` — env configuration
- `src/db.js` — Prisma singleton
- `src/middleware/` — `auth` (bcrypt sessions, CSRF, login throttle), `validate` (zod → 422),
  `errorHandler` (server logs, generic client message), `asyncHandler`
- `src/routes/` — one file per resource (`health`, `booking`, `videos`, `admin`, …)
- `src/services/` — `email`, `storage` (coming with booking/video stages)
- `prisma/schema.prisma` — data model; `prisma/seed.cjs` — seed script
- `scripts/import-legacy.cjs` — one-shot import from `../../legacy` (booking stage)
