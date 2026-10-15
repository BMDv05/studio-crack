'use strict';
const express = require('express');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'double-h-studio', time: new Date().toISOString() });
});

module.exports = router;
