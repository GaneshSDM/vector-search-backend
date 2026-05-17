# Vector Search Backend — Architecture & Cost Document

## Overview

Text → Embedding Model → pgvector → Supabase → Similarity Search

---

## Where Everything Lives

| Component | Location | What It Does |
|---|---|---|
| **PostgreSQL Database** | Supabase (cloud) | Stores documents + 384-dim embedding vectors |
| **pgvector Extension** | Supabase (cloud) | Vector similarity search operator (`<=>` cosine distance) |
| **Embedding Model** | Railway.app (backend server) | Converts text → 384-dim vector at request time |
| **Backend Server (Node.js)** | Railway.app (cloud) | Express API that orchestrates everything |
| **Your App (Frontend)** | Wherever you host it | Calls the backend API |

---

## Architecture Diagram

```
┌─────────────────────┐
│   YOUR WEB APP       │
│   (Frontend)         │
└─────────┬───────────┘
          │ HTTP POST
          ▼
┌─────────────────────────────────────────────────┐
│            RAILWAY.APP ($5/mo)                    │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │  Express Server (index.js)                   │ │
│  │                                              │ │
│  │  POST /api/embed   → embed + store           │ │
│  │  POST /api/search  → embed + query           │ │
│  │  GET  /api/health  → status check            │ │
│  │                                              │ │
│  │  ┌──────────────────────────────────────┐   │ │
│  │  │  Embedding Service                    │   │ │
│  │  │  @xenova/transformers                 │   │ │
│  │  │  Model: all-MiniLM-L6-v2              │   │ │
│  │  │  Size: ~80MB (ONNX format)            │   │ │
│  │  │  Output: 384-dim float32 vector       │   │ │
│  │  │  Runs in-process, no GPU needed        │   │ │
│  │  └──────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────┘
                       │ HTTP (Supabase client)
                       ▼
┌─────────────────────────────────────────────────┐
│            SUPABASE (Free / $25/mo)               │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │  PostgreSQL + pgvector                       │ │
│  │                                              │ │
│  │  ┌──────────────────────────────────────┐   │ │
│  │  │  documents table                      │   │ │
│  │  │  - id (BIGSERIAL)                    │   │ │
│  │  │  - content (TEXT)                    │   │ │
│  │  │  - embedding (vector(384))           │   │ │
│  │  │  - metadata (JSONB)                  │   │ │
│  │  │  - created_at (TIMESTAMPTZ)          │   │ │
│  │  │                                      │   │ │
│  │  │  Index: HNSW (vector_cosine_ops)     │   │ │
│  │  └──────────────────────────────────────┘   │ │
│  │                                              │ │
│  │  Function: match_documents()                 │ │
│  │  Returns similar docs ranked by cosine       │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## Cost Breakdown

### Monthly Fixed Costs

| Service | Plan | Cost/month | What You Get |
|---|---|---|---|
| **Railway.app** | Hobby | **$5.00** | 512MB RAM, 1 vCPU, 1GB disk |
| **Supabase** | Free | **$0.00** | 500MB DB, 2 projects, pgvector included |
| **Embedding Model** | Open-source | **$0.00** | all-MiniLM-L6-v2, no license fees |
| **TOTAL** | | **$5.00/mo** | |

### When You Scale

| Trigger | Upgrade | New Cost |
|---|---|---|
| DB exceeds 500MB | Supabase Pro | +$25/mo (8GB) |
| Need more RAM (heavy traffic) | Railway Performance | +$20/mo (2GB) |
| Need faster embeddings | Railway + GPU | Not available on Railway; switch to dedicated GPU server |
| >10K requests/day, need speed | Switch to API (OpenAI) | ~$0.02/1M tokens |

### Per-Request Cost Breakdown

| Step | Where | Cost per Request |
|---|---|---|
| HTTP to Railway | Railway | $0 (covered in $5/mo) |
| Run embedding model | Railway CPU | ~50-200ms, $0 marginal |
| Store/search in Supabase | Supabase | $0 (free tier) |
| **Total marginal cost** | | **$0.00 per request** |

This is essentially free at the per-request level — you pay a flat $5/month for the server that handles all requests.

---

## Exact Model Details

| Property | Value |
|---|---|
| Model Name | all-MiniLM-L6-v2 |
| Library | @xenova/transformers (ONNX runtime) |
| Format | ONNX (runs on CPU, no PyTorch needed) |
| Dimensions | 384 |
| Model Size (download) | ~80 MB |
| Memory Usage at Runtime | ~150-200 MB |
| Max Tokens | 256 |
| Quality | 1B training pairs, good general-purpose embeddings |

---

## How to Set Up

### 1. Supabase (5 minutes)

1. Go to https://supabase.com → New Project
2. Name it, set a DB password, choose region closest to Railway
3. Wait 2 minutes for provisioning
4. Go to SQL Editor → paste contents of `sql/setup.sql` → Run
5. Go to Settings → API → copy URL and `service_role` key

### 2. Railway.app (5 minutes)

1. Go to https://railway.app → New Project → Deploy from GitHub
2. Connect this repo
3. Add environment variables (from .env.example):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PORT=3000`
4. Deploy. First deploy takes ~2 min (downloads model).

### 3. Test it

```bash
# Store a document
curl -X POST https://your-app.railway.app/api/embed \
  -H "Content-Type: application/json" \
  -d '{"content": "The quick brown fox jumps over the lazy dog"}'

# Search
curl -X POST https://your-app.railway.app/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "fast animals"}'
```

---

## Cold Start Warning

Railway free/hobby tiers sleep after inactivity. First request after sleep takes ~5-10 seconds (model re-loads). To keep it warm:
- Use a cron job to ping `/api/health` every 5 minutes (free via cron-job.org)
- Or upgrade to Railway Performance tier ($20/mo, no sleep)

---

## Summary

| Question | Answer |
|---|---|
| Where is PostgreSQL? | Supabase cloud |
| Where is pgvector? | Inside Supabase (extension enabled) |
| Where is the embedding model? | Loaded on Railway.app at runtime |
| Where is the backend? | Railway.app |
| Monthly cost? | **$5.00** |
| Per-request cost? | **$0.00** |
| Who hosts the model? | You do (on Railway), not a third party |
| Data privacy? | Your data stays on Supabase. Embeddings generated on your server. |
