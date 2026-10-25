'use strict';
/* Prisma client singleton. Import from here everywhere. */
const { PrismaClient } = require('@prisma/client');

const { PrismaPg } = require('@prisma/adapter-pg');
const { requestContext } = require('./runtime');
function createDb(connectionString = process.env.DATABASE_URL) {
  const url = new URL(connectionString);
  const supabase = url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.pooler.supabase.com');
  if (supabase) url.searchParams.delete('sslmode');
  return new PrismaClient({ adapter: new PrismaPg({
    connectionString: url.toString(), max: 3, connectionTimeoutMillis: 15000,
    ...(supabase ? { ssl: { ca: require('./supabase-ca'), rejectUnauthorized: true } } : {}),
  }) });
}
let localDb;
const db = new Proxy({}, {
  get(_target, key) {
    const client = requestContext.getStore()?.db || (localDb ||= createDb());
    const value = client[key];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

module.exports = { db, createDb };
