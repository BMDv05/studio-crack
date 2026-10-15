# Double H Studio Website

Company portfolio and appointment-booking website.
Implements **Functional & Technical Specification v1.0 (October 2026)** — sections 1–18.

## What was built

| Spec | Implementation |
|---|---|
| Home (`/`) full-screen cinematic hero, CTAs Explore Our Work / Book a Meeting | `public/index.html` — muted looping hero video, poster fallback, pause control, data-saver + reduced-motion respect |
| Portfolio / Showreel (`/work`) | `public/work.html` — 3 project videos, lazy-load on scroll, sound only on user play, VideoObject JSON-LD |
| About (`/about`) | vision, approach, services, palette `#12393a #134c4b #e6ecec #46766f #161919`, contact + social |
| Book a Meeting (`/book`) | full form per §5 + consent + honeypot + submission key, client + server validation |
| Thank-you (`/book/thank-you`, noindex), Privacy (`/privacy`), 404 | static pages + `robots.txt` / `sitemap.xml` |
| Booking API `POST /api/booking` | `src/server.js` — 201 / 422 / 429 / 500 exactly per §12, processing order 1–6 |
| Data model §11 | `src/db.js` — SQLite `booking_requests` via built-in `node:sqlite`, saved **before** email |
| Emails §13 | `src/email.js` — studio notification (Reply-To = client) + client acknowledgment with SLA; SMTP via Nodemailer or file-log in `./emails/` |
| Reliability §14 | honeypot, min-fill-time, 5/hr IP rate-limit, idempotency key, 3-attempt retry, 5-min background retry, CSV export |
| Performance §15, A11y/SEO §16, Privacy §17 | lazy media, poster images, keyboard + focus styles, aria-live errors, OG/Twitter meta, Organization schema |

## Stack

Node.js 22+ · Express 4 · `node:sqlite` (built-in, no native build) · Nodemailer (optional SMTP) · vanilla HTML/CSS/JS.
Equivalent to the recommended Next.js stack per §9 ("any equivalent stack is acceptable"); same routes, API contract and data model, so it can be ported to Next.js without changing behavior.

## Run

```bash
cd double-h-studio
npm install
cp .env.example .env   # set STUDIO_EMAIL at minimum (Windows: copy)
npm test               # validation + API integration tests
npm start              # http://localhost:3100
```

Open: `/` · `/work` · `/about` · `/book` · `/privacy`. Health: `GET /api/health`.

## Booking API

`POST /api/booking` JSON fields: `full_name*`, `email*`, `phone`, `company`, `service*` (one of `STUDIO_SERVICES`), `description*` (10–5000), `preferred_date*` (YYYY-MM-DD, not past in `STUDIO_TIMEZONE`), `preferred_time*` (HH:MM), `meeting_type*` (`online`|`in_person`), `consent: true*`, plus `website` (honeypot, leave empty), `submissionKey` (UUID), `loadedAt` (ms timestamp).

- `201 {"ok":true,"reference":"<uuid>"}` — saved (and email attempted).
- `422 {"ok":false,"errors":{"email":"…"}}` — nothing saved.
- `429` — over 5 requests/hour/IP.
- `500` — generic message; details server-side only.

Admin CSV: `GET /api/admin/export?token=$ADMIN_TOKEN`.

## Configuration (open questions from §18, with defaults)

| Question | Default | Env |
|---|---|---|
| Services in dropdown | Brand Identity & Logo, Architectural Visualization, Interior & Spatial Design, Cinematic Video & Showreel, Web & Digital Presence | `STUDIO_SERVICES` (comma-separated) |
| Receiving inbox / replier | `studio@doubleh.example` | `STUDIO_EMAIL` |
| Time zone / hours | `Asia/Amman`; v1 enforces not-past only (no blocked days) | `STUDIO_TIMEZONE` |
| Client acknowledgment | enabled (file-logged without SMTP) | — |
| Portfolio videos | Videos manager (`/admin/videos`): **Published** + ready videos render on `/work` automatically via `GET /api/videos?category=…`; empty-state shown when a category has none | — |
| Languages | English only (RTL/Arabic ready via Cairo font) | — |
| SMTP | unset → `./emails/*.json`; set `SMTP_HOST/PORT/USER/PASS` for real delivery | see `.env.example` |

## Acceptance checklist (§18)

- [x] Booking reachable in one click from every page (sticky header + mobile menu).
- [x] Valid submit saves + notifies studio; invalid shows field-level errors, saves nothing.
- [x] Success redirect only after save (`/book/thank-you?reference=`).
- [x] Email failure keeps the record (`studio_email_sent=0`) and retries.
- [x] Responsive desktop/tablet/mobile; keyboard, contrast, reduced-motion, form a11y.

## Admin dashboard (`/admin`, studio team only)

Public pages, booking fields and validation are untouched. The dashboard adds:

- **Sign-in**: email + password, bcrypt-hashed, seeded once from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (min 10 chars, no sign-up). httpOnly `SameSite=Lax` session cookie (sliding `ADMIN_SESSION_MINUTES`, default 30, idle auto-logout on server + client), double-submit CSRF on every state-changing call, login rate-limit (10/10min per IP, 5/10min per email), logout. All `/admin` + `/api/admin` routes enforced server-side; `X-Robots-Tag: noindex` + `robots.txt` blocks.
- **Layout**: sidebar (Overview, Meeting Requests + unread badge, Videos, Settings), topbar with admin name + logout, same studio design language (deep green `#12393a`, mist `#e6ecec`, Poppins/Cairo), 8px scale, 48px inputs, shared toasts / skeletons / empty states / confirm modal; tables collapse to stacked cards on mobile.
- **Overview**: unread / this-week / confirmed cards, published + draft cards per video category, latest 5 requests, recent 5 uploads.
- **Meeting Requests**: search (name/email/company), filters (status, service, type, date range), sort, 20/page, New highlighting; detail page shows every field with times in the Settings time zone, status changes (timestamped history), private notes (author + time), mailto reply, manual-confirm email (recorded), studio-notification retry, delete with confirm, filtered CSV export.
- **Videos**: two categories — **Production** (cinematic 16:9) and **Social Media** (vertical 9:16, platforms multi-select, 90s default cap). Dashboard tabs with counts (last tab remembered), per-tab search/filter and drag-and-drop ordering saved per category; adaptive upload form (ratio + duration warnings, per-category size caps); edit can move videos across categories (lands at end of new order). Migration: `npm run migrate` (existing videos → production, order kept). Public `/work` switch (`/work?type=social` deep-links, back button works), 16:9 grid vs 9:16 muted-preview grid + lightbox players, `GET /api/videos?category=…` (`400` otherwise, published-only), VideoObject JSON-LD per view.
- **Settings**: time zone, response SLA, services list (drives booking validation), per-category upload caps, social max duration, storage driver, own password change.

Run with an admin: set `ADMIN_EMAIL`/`ADMIN_PASSWORD` in the environment, `npm start`, open `/admin/login`.
