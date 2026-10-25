# Isolated database (this copy)

This copy of Double H Studio ships its own PostgreSQL 17 instance, so it shares
nothing with the original project's database.

- **Address:** `postgresql://doubleh:doubleh@127.0.0.1:5434/doubleh`
- **Data:** `db/data` — a standalone **UTF-8** cluster. The admin account and
  the seven settings rows were carried over from the project database (its
  `videos` / `bookings` tables were empty).
- **Binaries:** `db/pgsql` — portable PostgreSQL 17 for Windows x64.
- **Logs:** `db/logs/postgres.log`

The instance listens on **localhost only, port 5434**, so it never collides
with the original project's database (5432/5433).

## Commands

Run from the repository root:

```bash
npm run db:up       # start (no-op if already running)
npm run db:status   # show pid / port
npm run db:down     # fast, clean shutdown
npm run db:migrate  # apply Prisma migrations
npm run db:seed     # seed the admin / settings
```

`npm run dev` starts the database automatically through the `predev` script.\nThe database runs as a hidden background process: no terminal window stays open,\nand it keeps running until you stop it with `npm run db:down`.

## Backups

Stop the database (`npm run db:down`) and copy `db/data` somewhere safe. The
directory is a complete PostgreSQL cluster; restore it by copying it back while
the database is stopped.

## Notes

- The cluster encoding is **UTF-8**, so Arabic titles/descriptions can be
  stored safely (the temporary source cluster was Windows-1252).
- `npm test` points at `doubleh_test` on this same instance (see
  `scripts/test.cjs`); it never touches the original project's database.
- `server/.env` already points at this instance; no manual configuration is
  required.
- `db/data`, `db/pgsql` and `db/logs` are git-ignored. The schema itself is
  managed by Prisma in `server/prisma`.
