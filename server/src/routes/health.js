'use strict';
const express = require('express');
const { asyncHandler } = require('../middleware/asyncHandler');
const { effSettings } = require('../services/settings');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'double-h-studio', time: new Date().toISOString() });
});

/* Public options for the booking form: services list, timezone, SLA. */
router.get('/meta', asyncHandler(async (req, res) => {
  const e = await effSettings();
  res.json({ ok: true, services: e.services, timezone: e.timezone, sla: e.sla });
}));

module.exports = router;
