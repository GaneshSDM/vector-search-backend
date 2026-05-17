const { pipeline } = require('@xenova/transformers');

let embedder = null;

/**
 * Lazy-load the embedding model.
 * Uses all-MiniLM-L6-v2: 384-dim vectors, ~80MB, lightweight enough for Railway hobby.
 */
async function getEmbedder() {
  if (!embedder) {
    console.log('[embedding] Loading model: Xenova/all-MiniLM-L6-v2 ...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('[embedding] Model loaded.');
  }
  return embedder;
}

/**
 * Generate a 384-dim embedding for a single text string.
 */
async function embedText(text) {
  const pipe = await getEmbedder();
  const result = await pipe(text, { pooling: 'mean', normalize: true });
  // result is a Tensor; extract the Float32Array
  return Array.from(result.data);
}

/**
 * Batch-embed multiple texts at once.
 */
async function embedBatch(texts) {
  const embeddings = [];
  for (const text of texts) {
    embeddings.push(await embedText(text));
  }
  return embeddings;
}

module.exports = { embedText, embedBatch };
