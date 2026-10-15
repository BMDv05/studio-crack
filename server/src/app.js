'use strict';
/* Express app: security headers, CORS for the frontend origin only, JSON
 * parsing, API routes, JSON 404, central error handler. */
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { config } = require('./config');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const healthRouter = require('./routes/health');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '64kb' }));

app.use('/api', healthRouter);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
