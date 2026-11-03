'use strict';
/* GET /api/videos?category=production|social — published + ready only.
 * 400 for any other category value. */
const express = require('express');
const { db } = require('../db');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

function toPublicVideo(v) {
  return {
    id: v.id, title: v.title, title_ar: v.titleAr || '', description: v.description, description_ar: v.descriptionAr || '', category: v.category,
    status: v.status, processing: v.processing,
    video_url: v.videoUrl, thumbnail_url: v.thumbnailUrl,
    duration_sec: v.durationSec, size_bytes: Number(v.sizeBytes),
    mime: v.mime, storage: v.storage, original_name: v.originalName,
    sort_order: v.sortOrder,
    platforms: Array.isArray(v.platforms) ? v.platforms : [],
    client_name: v.clientName, uploaded_by: v.uploadedBy,
    created_at: v.createdAt, updated_at: v.updatedAt,
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const { category } = req.query;
  if (category !== undefined && !['production', 'social'].includes(category)) {
    return res.status(400).json({ ok: false, error: 'Unknown category. Use production or social.' });
  }
  const videos = await db.video.findMany({
    where: { status: 'published', processing: 'ready', ...(category ? { category } : {}) },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });
  res.json({ ok: true, videos: videos.map(toPublicVideo) });
}));

module.exports = { videosRouter: router, toPublicVideo };

