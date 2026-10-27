'use strict';
const { db } = require('../db');
async function allowed(key, max, windowMs) {
  const window = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const rows = await db.$queryRaw`
    INSERT INTO public.rate_limits (key, window_start, hits)
    VALUES (${key}, ${window}, 1)
    ON CONFLICT (key) DO UPDATE SET
      hits = CASE WHEN rate_limits.window_start = EXCLUDED.window_start THEN rate_limits.hits + 1 ELSE 1 END,
      window_start = EXCLUDED.window_start
    RETURNING hits`;
  return rows[0].hits <= max;
}
module.exports = { allowed };
