'use strict';
/* Central error handler: full details in the server log, generic message out.
 * Must be registered AFTER all routes. Unknown paths under /api get JSON 404. */
function notFound(req, res, next) {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'Not found.' });
  next();
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status && Number.isInteger(err.status) ? err.status : 500;
  console.error(`[${req.method} ${req.originalUrl}]`, err && err.stack ? err.stack : err);
  if (req.path.startsWith('/api/')) {
    return res.status(status).json({ ok: false, error: status === 500 ? 'Something went wrong.' : err.message });
  }
  next(err);
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { notFound, errorHandler, httpError };
