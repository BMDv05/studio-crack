# Double H Studio — rebuild (React + Node.js)

One project, four parts: brand identity (Part A), React frontend + Node backend (Part B),
Production/Social video types (Part C), private admin dashboard (Part D), booking flow (Part E).

```
double-h-studio/
  client/   React 18 + Vite + React Router (public site + /admin UI), plain CSS with Part A tokens
  server/   Node.js + Express REST API (/api), PostgreSQL + Prisma, session auth for /admin
  legacy/   Previous HTML/CSS/JS site, frozen for reference until sign-off
  scripts/  dev.cjs — runs server + client together for `npm run dev`
```

## Quick start

```bash
# 1. Database (isolated PostgreSQL 17 for this copy, port 5434)
npm run db:up        # or skip: `npm run dev` starts it automatically

# 2. First-time server setup
cd server
npm install
cp .env.example .env        # set ADMIN_EMAIL / ADMIN_PASSWORD at minimum
npx prisma migrate dev      # creates tables
npm run seed                # seeds the admin + default settings
cd ..

# 3. First-time client setup
cd client
npm install
cd ..

# 4. Run everything (API :3100 + site :5173 with /api proxy)
npm run dev
```

- Site: http://localhost:5173 — public pages `/`, `/work`, `/about`, `/book`
- Admin: http://localhost:5173/admin (noindex; sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`)
- API health: http://localhost:3100/api/health

Individual processes: `npm run dev:server` / `npm run dev:client`.

## Tests

```bash
npm test          # booking flow, admin dashboard, video categories (13 tests)
```

Uses a separate `doubleh_test` database (created + migrated automatically by `pretest`).

## Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API + frontend together (Ctrl+C stops both) |
| `npm run db:up` | Start the isolated PostgreSQL instance (port 5434, see `db/README.md`) |
| `npm test` | Server API tests against `doubleh_test` |
| `npm run build` | Production build of the client into `client/dist` |
| `npm run import:legacy` | One-shot import of legacy SQLite data + media files |
| `npm --prefix server run db:seed` | Re-seed admin + default settings (idempotent) |

Maintenance helpers in `server/scripts/`:
`fix-missing-files.cjs` (marks imported videos whose file is missing as failed),
`verify-booking.cjs <email>` (inspect a booking), `list-videos.cjs` (video/file status).

## Layout & behavior notes

- **Brand (Part A):** colors only as CSS variables in `client/src/styles/tokens.css`
  (`--dh-ink` `#12393a`, `--dh-green` `#134c4b`, `--dh-mist` `#e6ecec`, `--dh-sage` `#46766f`,
  `--dh-black` `#161919`, white). Poppins/Cairo self-hosted via `@fontsource`. Eyebrow motif
  (line — label — line), radii 20/12/999px, 56px inputs, one focus style (2px sage outline,
  offset 2px), logical CSS properties, motion 300–600ms ease-out with `prefers-reduced-motion`.
- **Opening (public home):** the hero slot is a single pinned, scroll-driven R3F studio
  build — the object on screen is the scene, not a video or image sequence. After the
  build (400vh desktop / 330vh tablet / 260vh mobile), a 360/300/240vh finale moves the
  real camera to the hero camera's rear screen, draws the official Double H + STUDIO
  wordmark in the blueprint line style, orbits to the lens, pushes down the actual lens
  axis and closes to black before the real home page is released. Scroll is the only
  controller and
  forward/backward resolve from the same progress value. Reduced motion and no-WebGL /
  scene failures keep a static studio plate and open the site immediately.
- **Two video types (Part C):** `videos.category` is required (`production` | `social`),
  independent `sort_order` per category, `/work?type=` pill switch synced to the URL
  (default `production`, back button works), 16:9 grid vs 9:16 grid with muted looping
  previews, VideoObject JSON-LD.
- **Booking (Part E):** save-to-database first, then studio + client emails with retries
  (file-logged to `server/emails/` when SMTP is not configured). Rate limit + honeypot +
  minimum fill time server-side; field errors mirror the legacy wording exactly.
- **Admin (Part D):** bcrypt + httpOnly session cookies + CSRF header on every mutation,
  login rate limits, 30-minute idle logout, `noindex`. Overview / Meeting Requests
  (search, filters, sort, 20/page, unread highlighting, CSV export, status history,
  internal notes, confirmation email, studio-notification retry, delete) / Videos
  (per-tab drag-reorder, adaptive upload caps, MP4·MOV·WebM + magic-byte checks) /
  Settings (timezone, response promise, notification email, acknowledgment toggle,
  services list, per-category caps, social duration, storage driver, password).
- **Security:** helmet, CORS limited to the frontend origin, zod validation, central error
  handler, rate limits, no hard-coded secrets (all env via `server/.env`).

## Production notes

- `server/.env` holds all secrets (see `server/.env.example`). Never commit it.
- Run migrations with `npx prisma migrate deploy` (server cwd).
- Object storage (S3/R2): set `STORAGE_DRIVER=s3` + `S3_*` env vars; uploads then go
  browser → signed URL directly. Local disk (default) streams to `server/uploads`.
- SMTP: set `SMTP_*` in `server/.env`; otherwise emails are file-logged to `server/emails/`.
- The legacy site stays in `legacy/` until sign-off; port 3100 is used by the new API
  (do not run the legacy server at the same time).
