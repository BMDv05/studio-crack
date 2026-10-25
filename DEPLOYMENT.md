# Studio production deployment

Production source is the `main` branch. Cloudflare Worker: `double-h-studio`.
Supabase project: `nxtxhaddmhypzqaobrqc` (Double H Studio).

## Build and deploy

Use Node.js 22 or newer. Install the three lockfiles, generate Prisma, build the frontend, and deploy:

```sh
npm ci
npm --prefix server ci
npm --prefix client ci
npm --prefix server run generate
npm run build
npx wrangler deploy
```

GitHub Actions deploys pushes to `main` using the encrypted `CLOUDFLARE_API_TOKEN`
repository secret. The token is limited to the `double-h-studio` Worker.
`npm run deploy` regenerates Prisma and builds the frontend before deployment.

## Runtime configuration

`wrangler.jsonc` holds public configuration. These values must remain Worker secrets:
`DATABASE_URL`, `STORAGE_BROKER_TOKEN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`,
`SMTP_USER`, and `SMTP_PASS`. Never put secrets in a `VITE_*` variable or commit
`.dev.vars`. Production uses the `HYPERDRIVE` binding with a restricted
`studio_worker` role, query caching disabled, and verified TLS to Supabase using
the Supabase root CA. The `DATABASE_URL` fallback also verifies the Supabase CA,
bundled in `server/src/supabase-ca.js`.

Every API request has its own Prisma connection pool and closes it afterwards.
All app tables use RLS and deny direct access by `anon` and `authenticated`.
The Worker enforces admin sessions, CSRF, same-origin mutations, and persistent
booking/login rate limits.

## Database and storage

Applied production SQL is recorded in `supabase/migrations/`. Do not also run the
legacy initial Prisma migration against this populated database. The Prisma
schema generates the application client; production schema changes should be
reviewed and applied through the Supabase migrations.

The `studio-media` bucket is private. The `studio-storage` Edge Function authenticates
backend calls with a shared token whose SHA-256 digest is stored in `settings`.
Its Supabase service credential stays inside the Edge Function. It issues signed
upload URLs and short-lived read URLs. The Worker verifies upload size and magic
bytes before marking videos ready, and checks publication status before serving
media. Video transcoding is not available in this deployment; upload web-ready files.
Supabase Free limits individual uploads to 50 MB, which the admin UI enforces.

The same protected Edge Function sends email through the Hostinger mailbox on TLS
port 465. The mailbox password is transmitted over HTTPS from Worker secrets and is
never returned to the browser. Failed messages remain in `email_outbox`; the Worker
cron retries every five minutes, with at most five attempts, and updates booking
delivery flags after success. Check `failed` rows when diagnosing mail delivery.

## Verification

`server/scripts/smoke-deployment.cjs` checks the public API, admin sessions, CSRF,
bookings/idempotency, signed uploads, private drafts, publication, and media ranges.
Set `DEPLOYMENT_URL` and `STUDIO_ADMIN_PASSWORD` in your shell before running it.
It creates clearly named test records, sends the test booking emails to the Studio
mailbox, and removes only its own records and session afterward.

## Domain and email DNS

Domain: `double-h-studio.com`; Hostinger remains the registrar and mailbox provider.
Cloudflare nameservers: `howard.ns.cloudflare.com` and `paige.ns.cloudflare.com`.
Keep both Hostinger MX records, the SPF and DMARC TXT records, all three
`hostingermail-*._domainkey` CNAMEs, and mail autoconfiguration CNAMEs. Mail CNAMEs
must be DNS-only. Connect the apex and `www` to this Worker after application checks pass.
