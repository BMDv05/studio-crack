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
const { bookingRouter } = require('./routes/booking');
const { videosRouter } = require('./routes/videos');
const { adminRouter } = require('./routes/admin');
const { videosRouter: adminVideosRouter } = require('./routes/adminVideos');
const { uploadRoot } = require('./services/storage');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '64kb' }));

if (process.env.WORKER_RUNTIME === 'true') {
  app.use('/api/admin/videos', require('./routes/cloudStorage').router);
}

app.use('/api', healthRouter);
app.use('/api/booking', bookingRouter);
app.use('/api/videos', videosRouter);
app.use('/api/admin/videos', adminVideosRouter);
app.use('/api/admin', adminRouter);

// Uploaded media (unguessable file names; drafts stay unpublished)
if (process.env.WORKER_RUNTIME !== 'true') {
  app.use('/media', express.static(uploadRoot(), { maxAge: '7d' }));
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
