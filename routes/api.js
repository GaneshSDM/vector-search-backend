const express = require('express');
const router = express.Router();
const { embedText } = require('../services/embedding');
const { storeDocument, searchSimilar } = require('../services/supabase');

/**
 * POST /api/embed
 * Stores a text document and its embedding.
 * Body: { content: string, metadata?: object }
 */
router.post('/embed', async (req, res) => {
  try {
    const { content, metadata } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const embedding = await embedText(content);
    const doc = await storeDocument({ content, embedding, metadata });

    res.json({
      success: true,
      id: doc.id,
      dimensions: embedding.length,
    });
  } catch (err) {
    console.error('[api] /embed error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/search
 * Search for similar documents by text query.
 * Body: { query: string, limit?: number, threshold?: number }
 */
router.post('/search', async (req, res) => {
  try {
    const { query, limit, threshold } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const embedding = await embedText(query);
    const results = await searchSimilar(embedding, { limit, threshold });

    res.json({ results, count: results.length });
  } catch (err) {
    console.error('[api] /search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/health
 */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

module.exports = router;
