import { createClient } from '@supabase/supabase-js';

let _supabase = null;

function getSupabase() {
  if (!_supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('[supabase] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use this endpoint.');
    }

    _supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });
  }
  return _supabase;
}

/**
 * Store a document embedding in the documents table.
 * @param {{ content: string, embedding: number[], metadata?: object }} doc
 */
async function storeDocument({ content, embedding, metadata = {} }) {
  const formattedEmbedding = `[${embedding.join(',')}]`;
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('documents')
    .insert({
      content,
      embedding: formattedEmbedding,
      metadata,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  return data;
}

/**
 * Search for similar documents by comparing embedding vectors.
 * Uses pgvector cosine distance (<=> operator).
 * @param {number[]} embedding - query embedding vector
 * @param {{ limit?: number, threshold?: number }} options
 */
async function searchSimilar(embedding, { limit = 10, threshold = 0.5 } = {}) {
  const formattedEmbedding = `[${embedding.join(',')}]`;
  const supabase = getSupabase();

  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: formattedEmbedding,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) throw new Error(`Supabase search error: ${error.message}`);
  return data;
}

/**
 * Run the pgvector setup SQL. Call once during initial setup.
 */
async function runSetup() {
  const sql = `
    -- Enable pgvector extension
    CREATE EXTENSION IF NOT EXISTS vector;

    -- Create the documents table
    CREATE TABLE IF NOT EXISTS documents (
      id BIGSERIAL PRIMARY KEY,
      content TEXT NOT NULL,
      embedding vector(384),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Create an HNSW index for fast ANN search
    CREATE INDEX IF NOT EXISTS documents_embedding_idx
      ON documents
      USING hnsw (embedding vector_cosine_ops);

    -- Search function
    CREATE OR REPLACE FUNCTION match_documents(
      query_embedding vector(384),
      match_threshold FLOAT DEFAULT 0.5,
      match_count INT DEFAULT 10
    )
    RETURNS TABLE(
      id BIGINT,
      content TEXT,
      similarity FLOAT,
      metadata JSONB
    )
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN QUERY
      SELECT
        d.id,
        d.content,
        1 - (d.embedding <=> query_embedding) AS similarity,
        d.metadata
      FROM documents d
      WHERE 1 - (d.embedding <=> query_embedding) > match_threshold
      ORDER BY d.embedding <=> query_embedding
      LIMIT match_count;
    END;
    $$;
  `;

  // Supabase doesn't allow multi-statement queries via client, so we execute piecewise
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    const supabase = getSupabase();
    const { error } = await supabase.rpc('exec_sql', { sql: statement }).maybeSingle();
    if (error) {
      // If exec_sql not available, log the SQL for manual execution
      console.warn('[supabase] Could not auto-execute SQL. Run it manually in Supabase SQL Editor.');
      console.warn('[supabase] See sql/setup.sql');
      return false;
    }
  }

  console.log('[supabase] Schema setup complete.');
  return true;
}

export { storeDocument, searchSimilar, runSetup };
