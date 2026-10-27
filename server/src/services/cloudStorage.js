'use strict';
const { requestContext } = require('../runtime');
async function broker(action, payload = {}) {
  const env = requestContext.getStore()?.env || process.env;
  const response = await fetch(`${env.SUPABASE_URL}/functions/v1/studio-storage`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.STORAGE_BROKER_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Storage request failed (${response.status}): ${data.error || 'unavailable'}`);
  return data;
}
module.exports = { broker };
