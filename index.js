require('dotenv').config();
const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const { runSetup } = require('./services/supabase');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Routes
app.use('/api', apiRoutes);

// Health check at root
app.get('/', (_req, res) => {
  res.json({
    name: 'vector-search-backend',
    version: '1.0.0',
    model: process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
  });
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`[server] Listening on port ${PORT}`);
  console.log(`[server] Embedding model: ${process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2'}`);

  // Attempt schema setup on cold start (non-blocking via RLS bypass using service_role)
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await runSetup();
    } catch (err) {
      console.warn('[server] Schema setup failed (may already exist):', err.message);
    }
  } else {
    console.warn('[server] Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
});
