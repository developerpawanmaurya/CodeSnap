/**
 * Pure-JS persistent store for snippets.
 *
 * Storage is split across two files:
 *   - codesnap.json             snippet metadata (small, written on every CRUD)
 *   - codesnap.embeddings.json  embeddings only  (large, written rarely)
 *
 * Why split? Embeddings are 1536-float arrays — about 15 KB per snippet. Once
 * you've imported a few hundred files, the embeddings dwarf the snippet text.
 * Keeping them in a sidecar means CRUD operations rewrite a small file (fast)
 * and the heavy embeddings file only changes when new embeddings are computed.
 *
 * If you ever outgrow this, swap this file for a real DB — the rest of the
 * app only depends on the exports below.
 */

import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Snippet, SnippetInput } from "./types";

const DB_PATH =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "codesnap.json");
const EMB_PATH = DB_PATH.replace(/\.json$/i, ".embeddings.json");

type Store = { snippets: Snippet[] };
type EmbeddingEntry = { embedding: number[]; text: string };
type EmbeddingStore = Record<string, EmbeddingEntry>;

let _cache: Store | null = null;
let _emb: EmbeddingStore | null = null;
// Pre-computed search-prepared strings, lazily built per snippet, invalidated
// on edit. See `getHaystack` below.
const _haystack = new Map<string, { lower: string; codeStripped: string }>();

function load(): Store {
  if (_cache) return _cache;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let snippets: any[] = [];
  let migratedFromOldFormat = false;

  if (fs.existsSync(DB_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
      snippets = Array.isArray(parsed.snippets) ? parsed.snippets : [];
    } catch {
      snippets = [];
    }
  }

  // Migrate inline embeddings (old format) into the sidecar file.
  const inlineEmb: EmbeddingStore = {};
  for (const s of snippets) {
    if (Array.isArray(s.embedding)) {
      inlineEmb[s.id] = { embedding: s.embedding, text: s.embeddingText || "" };
      delete s.embedding;
      delete s.embeddingText;
      migratedFromOldFormat = true;
    }
  }

  _cache = { snippets: snippets as Snippet[] };

  if (migratedFromOldFormat) {
    _emb = { ...loadEmbeddingsFromDisk(), ...inlineEmb };
    persistSnippets(); // write the slimmer file
    persistEmbeddings(); // write the new sidecar
  }

  return _cache;
}

function loadEmbeddingsFromDisk(): EmbeddingStore {
  if (!fs.existsSync(EMB_PATH)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(EMB_PATH, "utf-8"));
    return typeof parsed === "object" && parsed ? (parsed as EmbeddingStore) : {};
  } catch {
    return {};
  }
}

function loadEmbeddings(): EmbeddingStore {
  if (_emb) return _emb;
  _emb = loadEmbeddingsFromDisk();
  return _emb;
}

// ─── Persistence with pause/resume ───

let _snippetsPaused = 0;
let _snippetsDirty = false;
let _embPaused = 0;
let _embDirty = false;

function persistSnippets(): void {
  if (!_cache) return;
  if (_snippetsPaused > 0) {
    _snippetsDirty = true;
    return;
  }
  const tmp = DB_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(_cache, null, 2), "utf-8");
  fs.renameSync(tmp, DB_PATH);
}

function persistEmbeddings(): void {
  if (!_emb) return;
  if (_embPaused > 0) {
    _embDirty = true;
    return;
  }
  const tmp = EMB_PATH + ".tmp";
  // No pretty-printing — this file is huge and never meant to be human-edited.
  fs.writeFileSync(tmp, JSON.stringify(_emb), "utf-8");
  fs.renameSync(tmp, EMB_PATH);
}

/**
 * Coalesce many mutations into a single disk write each. Use during bulk
 * imports to avoid O(N²) rewrites of either file.
 */
export function pausePersist(): void {
  _snippetsPaused++;
  _embPaused++;
}

export function resumePersist(): void {
  _snippetsPaused = Math.max(0, _snippetsPaused - 1);
  _embPaused = Math.max(0, _embPaused - 1);
  if (_snippetsPaused === 0 && _snippetsDirty) {
    _snippetsDirty = false;
    persistSnippets();
  }
  if (_embPaused === 0 && _embDirty) {
    _embDirty = false;
    persistEmbeddings();
  }
}

// ─── CRUD ───

export function listSnippets(opts?: {
  tag?: string;
  language?: string;
  starred?: boolean;
}): Snippet[] {
  const store = load();
  let rows = store.snippets;
  if (opts?.starred) rows = rows.filter((s) => s.starred);
  if (opts?.language) rows = rows.filter((s) => s.language === opts.language);
  if (opts?.tag) rows = rows.filter((s) => s.tags.includes(opts.tag!));
  return [...rows].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getSnippet(id: string): Snippet | null {
  return load().snippets.find((s) => s.id === id) || null;
}

export function createSnippet(input: SnippetInput): Snippet {
  const store = load();
  const now = new Date().toISOString();
  const snippet: Snippet = {
    id: nanoid(12),
    title: (input.title || "").trim() || "Untitled",
    description: (input.description || "").trim(),
    code: input.code,
    language: input.language || "plaintext",
    tags: input.tags || [],
    starred: input.starred ?? false,
    createdAt: now,
    updatedAt: now,
  };
  store.snippets.push(snippet);
  persistSnippets();
  return snippet;
}

export function updateSnippet(
  id: string,
  patch: Partial<SnippetInput>,
): Snippet | null {
  const store = load();
  const idx = store.snippets.findIndex((s) => s.id === id);
  if (idx === -1) return null;

  const existing = store.snippets[idx];
  const contentChanged =
    patch.title !== undefined ||
    patch.description !== undefined ||
    patch.code !== undefined ||
    patch.tags !== undefined;

  const updated: Snippet = {
    ...existing,
    title: patch.title ?? existing.title,
    description: patch.description ?? existing.description,
    code: patch.code ?? existing.code,
    language: patch.language ?? existing.language,
    tags: patch.tags ?? existing.tags,
    starred: patch.starred ?? existing.starred,
    updatedAt: new Date().toISOString(),
  };
  store.snippets[idx] = updated;
  persistSnippets();

  if (contentChanged) {
    const emb = loadEmbeddings();
    delete emb[id];
    persistEmbeddings();
    _haystack.delete(id);
  }

  return updated;
}

export function deleteSnippet(id: string): boolean {
  const store = load();
  const before = store.snippets.length;
  store.snippets = store.snippets.filter((s) => s.id !== id);
  if (store.snippets.length === before) return false;
  persistSnippets();

  const emb = loadEmbeddings();
  if (emb[id]) {
    delete emb[id];
    persistEmbeddings();
  }
  _haystack.delete(id);
  return true;
}

export function listAllTags(): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of load().snippets) {
    for (const t of s.tags) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

// ─── Embeddings storage ───

export type EmbeddingRow = {
  id: string;
  snippet: Snippet;
  embedding: number[] | null;
  embeddingText: string | null;
};

export function getEmbeddingRows(): EmbeddingRow[] {
  const emb = loadEmbeddings();
  return load().snippets.map((s) => {
    const e = emb[s.id];
    return {
      id: s.id,
      snippet: s,
      embedding: e ? e.embedding : null,
      embeddingText: e ? e.text : null,
    };
  });
}

export function setEmbedding(id: string, vector: number[], text: string): void {
  const emb = loadEmbeddings();
  emb[id] = { embedding: vector, text };
  persistEmbeddings();
}

// ─── Cached search-prepared strings ───
// Built once per snippet, reused across every search until the snippet is
// edited. Skips per-search regex string-stripping work.

export function getHaystack(s: Snippet): { lower: string; codeStripped: string } {
  const cached = _haystack.get(s.id);
  if (cached) return cached;
  const lower = (s.title + "\n" + s.description + "\n" + s.tags.join(" ")).toLowerCase();
  const codeStripped = s.code.toLowerCase().replace(/[^a-z0-9]/g, "");
  const built = { lower, codeStripped };
  _haystack.set(s.id, built);
  return built;
}

// ─── Keyword fallback search ───

export function ftsSearch(query: string, limit = 30): Snippet[] {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return [];

  type Scored = { snippet: Snippet; score: number };
  const scored: Scored[] = [];

  for (const s of load().snippets) {
    const haystack = (s.title + "\n" + s.description + "\n" + s.code + "\n" + s.tags.join(" ") + "\n" + s.language).toLowerCase();
    let score = 0;
    let matchedAll = true;
    for (const tok of tokens) {
      const occ = haystack.split(tok).length - 1;
      if (occ === 0) {
        matchedAll = false;
        break;
      }
      score += occ;
    }
    if (matchedAll) scored.push({ snippet: s, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((r) => r.snippet);
}

// ─── Seed sample data on first run ───

export function seedIfEmpty(): void {
  const store = load();
  if (store.snippets.length > 0) return;

  const samples: SnippetInput[] = [
    {
      title: "Email regex validator",
      description: "Validates an email address using RFC 5322 simplified pattern.",
      language: "typescript",
      tags: ["regex", "validation", "email"],
      code: `export function isValidEmail(email: string): boolean {
  const pattern = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return pattern.test(email.trim().toLowerCase());
}`,
    },
    {
      title: "Debounce hook",
      description: "React hook that debounces a value by the given delay in ms.",
      language: "typescript",
      tags: ["react", "hooks", "performance"],
      starred: true,
      code: `import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}`,
    },
    {
      title: "Postgres bulk upsert",
      description: "Insert many rows with ON CONFLICT update for fast bulk syncs.",
      language: "sql",
      tags: ["postgres", "sql", "upsert"],
      code: `INSERT INTO users (id, email, name, updated_at)
SELECT * FROM UNNEST($1::int[], $2::text[], $3::text[], $4::timestamptz[])
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  updated_at = EXCLUDED.updated_at;`,
    },
    {
      title: "Format bytes to human-readable",
      description: "Converts a byte count to KB / MB / GB with one decimal place.",
      language: "javascript",
      tags: ["utility", "formatting"],
      code: `export function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
}`,
    },
    {
      title: "Python retry decorator",
      description: "Retry a function on exception with exponential backoff.",
      language: "python",
      tags: ["python", "retry", "decorator"],
      code: `import time
import functools

def retry(times=3, delay=0.5, backoff=2.0):
    def deco(fn):
        @functools.wraps(fn)
        def wrapper(*a, **kw):
            d = delay
            for attempt in range(times):
                try:
                    return fn(*a, **kw)
                except Exception:
                    if attempt == times - 1:
                        raise
                    time.sleep(d)
                    d *= backoff
        return wrapper
    return deco`,
    },
    {
      title: "Git: undo last commit (keep changes)",
      description: "Revert the most recent commit but leave file changes staged.",
      language: "bash",
      tags: ["git", "cli"],
      code: `git reset --soft HEAD~1`,
    },
    {
      title: "Fetch with timeout",
      description: "AbortController-based fetch wrapper that times out after N ms.",
      language: "typescript",
      tags: ["fetch", "http", "abort"],
      code: `export async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}`,
    },
    {
      title: "CSS: center anything",
      description: "Three-line flexbox centering trick.",
      language: "css",
      tags: ["css", "layout"],
      code: `.center {
  display: flex;
  align-items: center;
  justify-content: center;
}`,
    },
  ];

  for (const s of samples) createSnippet(s);
}
