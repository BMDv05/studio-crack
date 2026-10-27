'use strict';
/* Central error handler: full details in the server log, generic message out.
 * Must be registered AFTER all routes. Unknown paths under /api get JSON 404. */
function notFound(req, res, next) {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'Not found.' });
  next();
}

/* Parser and body errors describe internals ("Expected property name or '}' in
 * JSON at position 1"); the client gets a fixed sentence for those instead. */
const SAFE_MESSAGES = {
  'entity.parse.failed': 'Invalid JSON body.',
  'entity.too.large': 'Request body is too large.',
  'encoding.unsupported': 'Unsupported content encoding.',
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  console.error(`[${req.method} ${req.originalUrl}]`, err && err.stack ? err.stack : err);
  if (req.path.startsWith('/api/')) {
    const safe = status === 500 ? 'Something went wrong.' : SAFE_MESSAGES[err.type];
    return res.status(status).json({ ok: false, error: safe || err.message });
  }
  next(err);
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { notFound, errorHandler, httpError };
