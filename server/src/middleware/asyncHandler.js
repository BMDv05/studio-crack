'use strict';
/* Wrap async route handlers so rejections reach the central error handler
 * (Express 4 does not catch them on its own). */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { asyncHandler };
