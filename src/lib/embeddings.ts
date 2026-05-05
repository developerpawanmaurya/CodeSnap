import OpenAI from "openai";
import {
  getEmbeddingRows,
  getHaystack,
  setEmbedding,
  type EmbeddingRow,
} from "./db";
import type { Snippet, SnippetWithScore } from "./types";

const MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const DISABLED = process.env.DISABLE_EMBEDDINGS === "true" || !process.env.OPENAI_API_KEY;

let _client: OpenAI | null = null;

function client(): OpenAI {
  if (_client) return _client;
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export function embeddingsAvailable(): boolean {
  return !DISABLED;
}

/**
 * Build the canonical text we feed to the embeddings model for a snippet.
 * Including the title, description, language, and tags as context boosts
 * semantic recall significantly compared to just embedding the raw code.
 */
export function buildEmbeddingText(s: Snippet): string {
  const tags = s.tags.length ? `Tags: ${s.tags.join(", ")}\n` : "";
  return [
    `Title: ${s.title}`,
    s.description ? `Description: ${s.description}` : null,
    `Language: ${s.language}`,
    tags.trim(),
    `Code:\n${s.code}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function embed(text: string): Promise<number[]> {
  const resp = await client().embeddings.create({
    model: MODEL,
    input: text,
  });
  return resp.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const resp = await client().embeddings.create({
    model: MODEL,
    input: texts,
  });
  return resp.data.map((d) => d.embedding);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Backfill missing embeddings. Called lazily before each semantic search so
 * newly-added snippets are always indexed.
 *
 * Capped at MAX_BACKFILL_PER_CALL items so the first search after a large
 * bulk import returns in a few seconds rather than minutes — subsequent
 * searches progressively finish the index.
 */
const MAX_BACKFILL_PER_CALL = 96;

export async function ensureEmbeddings(rows: EmbeddingRow[]): Promise<EmbeddingRow[]> {
  const missing = rows.filter((r) => !r.embedding);
  if (missing.length === 0) return rows;

  const toBackfill = missing.slice(0, MAX_BACKFILL_PER_CALL);
  const BATCH = 32;
  for (let i = 0; i < toBackfill.length; i += BATCH) {
    const chunk = toBackfill.slice(i, i + BATCH);
    const texts = chunk.map((r) => buildEmbeddingText(r.snippet));
    const vectors = await embedBatch(texts);
    chunk.forEach((row, idx) => {
      setEmbedding(row.id, vectors[idx], texts[idx]);
      row.embedding = vectors[idx];
      row.embeddingText = texts[idx];
    });
  }
  return rows;
}

export type SemanticSearchOpts = {
  query: string;
  limit?: number;
  threshold?: number;
};

/**
 * Hybrid scoring: cosine similarity + keyword bonus.
 *
 * Pure cosine often ranks a 600-line file ABOVE a 10-line function that's
 * literally named `loadMore` for the query "load more". The bonus lifts
 * snippets whose title/tags/code contain the user's query terms, which
 * matches how a human would judge relevance.
 *
 * Final score = cosine + 0.20 * (titleHits + tagHits)/tokens + 0.05 * (codeHits/tokens)
 *             - 0.05 if the snippet is a whole-file ("file" tag) and a smaller
 *               function-level result also matches strongly.
 */
export async function semanticSearch({
  query,
  limit = 20,
  threshold = 0.1,
}: SemanticSearchOpts): Promise<SnippetWithScore[]> {
  const rows = await ensureEmbeddings(getEmbeddingRows());
  const indexed = rows.filter((r) => r.embedding);
  if (indexed.length === 0) return [];

  const queryVec = await embed(query);
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);

  const scored = indexed.map((r) => {
    const cosine = cosineSimilarity(queryVec, r.embedding!);
    const s = r.snippet;
    // Pre-computed strings — see db.getHaystack. Lower-cased title+desc+tags
    // and a code body with all non-alphanumerics stripped (for camelCase match).
    const { lower, codeStripped } = getHaystack(s);

    let titleHits = 0;
    let codeHits = 0;
    for (const tok of tokens) {
      if (lower.includes(tok)) titleHits++;
      if (codeStripped.includes(tok)) codeHits++;
    }
    const tokenCount = Math.max(1, tokens.length);
    const titleBonus = (titleHits / tokenCount) * 0.2;
    const codeBonus = (codeHits / tokenCount) * 0.05;
    // Whole-file snippets get a tiny penalty so an extracted symbol with
    // similar relevance ranks above the giant file it came from.
    const filePenalty = s.tags.includes("file") ? -0.03 : 0;

    return {
      ...s,
      score: Math.max(0, Math.min(1, cosine + titleBonus + codeBonus + filePenalty)),
      matchType: "semantic" as const,
    };
  });

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scored.filter((s) => (s.score ?? 0) >= threshold).slice(0, limit);
}
