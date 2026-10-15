'use strict';
/* Zod request validation. On failure: 422 with per-field messages, and
 * nothing is saved (handlers run only after this passes). */
const { httpError } = require('./errorHandler');

function fieldErrors(zodError) {
  const errors = {};
  for (const issue of zodError.issues) {
    const key = (issue.path && issue.path[0] !== undefined) ? String(issue.path[0]) : '_';
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      return res.status(422).json({ ok: false, errors: fieldErrors(parsed.error) });
    }
    req[source] = parsed.data;
    next();
  };
}

module.exports = { validate, fieldErrors, httpError };
