/**
 * Bulk-import code snippets from a local folder or a public GitHub repo.
 *
 * Each source file becomes one snippet. Optionally, each top-level
 * function/class/struct in that file becomes its own snippet too.
 */

import fs from "node:fs";
import path from "node:path";
import {
  createSnippet,
  getEmbeddingRows,
  getSnippet,
  pausePersist,
  resumePersist,
  updateSnippet,
} from "./db";
import { extractSymbols, type ExtractedSymbol } from "./symbols";
import {
  aiAnalysisAvailable,
  analyzeFile,
  sliceByLines,
  suggestTitleAndDescription,
} from "./aiAnalyzer";
import type { Snippet, SnippetInput } from "./types";

// ─── Filtering rules ───

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".cs": "csharp",
  ".rb": "ruby",
  ".php": "php",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".sql": "sql",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "css",
  ".less": "css",
  ".json": "json",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".md": "markdown",
  ".markdown": "markdown",
  ".c": "plaintext",
  ".cc": "plaintext",
  ".cpp": "plaintext",
  ".h": "plaintext",
  ".hpp": "plaintext",
  ".lua": "plaintext",
  ".vue": "javascript",
  ".svelte": "javascript",
};

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".cache",
  ".turbo",
  "dist",
  "build",
  "out",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  ".env",
  "bin",
  "obj",
  ".idea",
  ".vscode",
  ".vs",
  "coverage",
  ".pytest_cache",
  ".gradle",
  ".mvn",
  "vendor",
  ".terraform",
]);

const MAX_FILE_BYTES = 100_000;
const DEFAULT_MAX_FILES = 500;

// ─── Public types ───

export type ImportSource =
  | { kind: "local"; absolutePath: string }
  | { kind: "github"; url: string };

export type ImportOptions = {
  extractSymbols?: boolean;
  useAI?: boolean; // when true, GPT analyzes each file for semantic chunks
  maxFiles?: number;
  extraTags?: string[];
};

export type ImportSummary = {
  imported: number;
  skippedExisting: number;
  skippedTooLarge: number;
  skippedUnsupported: number;
  errors: { path: string; reason: string }[];
  filesProcessed: number;
  source: string;
  aiUsed: boolean;
};

// ─── Entry points ───

export async function importFromLocal(
  absolutePath: string,
  opts: ImportOptions = {},
): Promise<ImportSummary> {
  const root = path.resolve(absolutePath);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Not a directory: ${root}`);
  }

  const files = walkLocal(root, opts.maxFiles ?? DEFAULT_MAX_FILES);
  const summary = blankSummary(`local:${root}`);
  const useAI = opts.useAI === true && aiAnalysisAvailable();
  summary.aiUsed = useAI;

  // Read all files first (cheap, sync), then process in parallel.
  type Job = { relPath: string; lang: string; code: string };
  const jobs: Job[] = [];
  for (const filePath of files) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_BYTES) {
        summary.skippedTooLarge++;
        continue;
      }
      const ext = path.extname(filePath).toLowerCase();
      const lang = EXT_TO_LANG[ext];
      if (!lang) {
        summary.skippedUnsupported++;
        continue;
      }
      const code = fs.readFileSync(filePath, "utf-8");
      if (looksBinary(code)) {
        summary.skippedUnsupported++;
        continue;
      }
      jobs.push({ relPath: path.relative(root, filePath).replace(/\\/g, "/"), lang, code });
    } catch (err) {
      summary.errors.push({
        path: filePath,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  pausePersist();
  try {
    const sourceTag = `source:${path.basename(root)}`;
    await runJobs(jobs, useAI ? AI_CONCURRENCY : 1, async (job) => {
      try {
        await processFile({
          title: job.relPath,
          sourcePath: job.relPath,
          code: job.code,
          language: job.lang,
          sourceTag,
          opts,
          useAI,
          summary,
        });
        summary.filesProcessed++;
      } catch (err) {
        summary.errors.push({
          path: job.relPath,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    });
  } finally {
    resumePersist();
  }
  return summary;
}

export async function importFromGithub(
  rawUrl: string,
  opts: ImportOptions = {},
): Promise<ImportSummary> {
  const parsed = parseGithubUrl(rawUrl);
  if (!parsed) throw new Error(`Not a recognizable GitHub URL: ${rawUrl}`);

  const { owner, repo } = parsed;
  let { ref, subPath } = parsed;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  // Resolve default branch if no ref given
  if (!ref) {
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!repoRes.ok) throw new Error(`GitHub repo lookup failed (${repoRes.status})`);
    const repoJson = await repoRes.json();
    ref = repoJson.default_branch || "main";
  }

  // Pull recursive tree
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`,
    { headers },
  );
  if (!treeRes.ok) {
    throw new Error(
      `GitHub tree lookup failed (${treeRes.status}). For private repos or large public ones, set GITHUB_TOKEN.`,
    );
  }
  const tree = await treeRes.json();
  if (tree.truncated) {
    // Still proceed — just won't see every file in very large repos.
  }

  const candidateFiles: { path: string; size: number }[] = (tree.tree || [])
    .filter((n: any) => n.type === "blob")
    .filter((n: any) => !subPath || n.path.startsWith(subPath))
    .filter((n: any) => !shouldSkipPath(n.path))
    .filter((n: any) => EXT_TO_LANG[path.extname(n.path).toLowerCase()])
    .filter((n: any) => (n.size ?? 0) <= MAX_FILE_BYTES)
    .slice(0, opts.maxFiles ?? DEFAULT_MAX_FILES);

  const summary = blankSummary(`github:${owner}/${repo}@${ref}${subPath ? "/" + subPath : ""}`);
  const sourceTag = `source:${repo}`;
  const useAI = opts.useAI === true && aiAnalysisAvailable();
  summary.aiUsed = useAI;

  // Fetch raw contents in parallel (raw.githubusercontent.com isn't rate-limited like api)
  const FETCH_CONCURRENCY = 12;
  let cursor = 0;
  pausePersist();
  try {
    async function worker() {
      while (cursor < candidateFiles.length) {
        const idx = cursor++;
        const node = candidateFiles[idx];
        try {
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${node.path}`;
          const res = await fetch(rawUrl);
          if (!res.ok) {
            summary.errors.push({ path: node.path, reason: `HTTP ${res.status}` });
            continue;
          }
          const code = await res.text();
          if (code.length > MAX_FILE_BYTES) {
            summary.skippedTooLarge++;
            continue;
          }
          if (looksBinary(code)) {
            summary.skippedUnsupported++;
            continue;
          }
          const ext = path.extname(node.path).toLowerCase();
          await processFile({
            title: node.path,
            sourcePath: node.path,
            code,
            language: EXT_TO_LANG[ext]!,
            sourceTag,
            opts,
            useAI,
            summary,
          });
          summary.filesProcessed++;
        } catch (err) {
          summary.errors.push({
            path: node.path,
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, worker));
  } finally {
    resumePersist();
  }
  return summary;
}

// ─── Per-file processing ───

async function processFile(args: {
  title: string;
  sourcePath: string;
  code: string;
  language: string;
  sourceTag: string;
  opts: ImportOptions;
  useAI: boolean;
  summary: ImportSummary;
}): Promise<void> {
  const { sourcePath, code, language, sourceTag, opts, useAI, summary } = args;
  const existingHashes = getExistingCodeHashes();

  const dirParts = path.posix.dirname(sourcePath).split("/").filter(Boolean).slice(0, 3);
  const baseTags = unique([
    ...(opts.extraTags || []),
    sourceTag,
    language,
    ...dirParts.map((p) => p.replace(/[^a-z0-9-]+/gi, "")).filter((p) => p && p.length < 24),
  ]);

  // ── AI path: ask GPT to identify functional units, name them, and slice them out ──
  if (useAI) {
    try {
      const analysis = await analyzeFile({ filePath: sourcePath, language, code });
      if (analysis.units.length > 0) {
        for (const u of analysis.units) {
          const unitCode = sliceByLines(code, u.lineStart, u.lineEnd);
          if (!unitCode.trim()) continue;
          const h = hashCode(unitCode);
          if (existingHashes.has(h)) {
            summary.skippedExisting++;
            continue;
          }
          createSnippet({
            title: u.title,
            description: `${u.description}\n\nFrom ${sourcePath}:${u.lineStart}-${u.lineEnd}`,
            code: unitCode,
            language,
            tags: unique([...baseTags, ...u.tags, "ai-extracted"]),
            starred: false,
          });
          existingHashes.add(h);
          summary.imported++;
        }
        return; // AI path handled this file completely
      }
      // Fall through to regex path if AI returned nothing useful
    } catch (err) {
      summary.errors.push({
        path: sourcePath,
        reason: `AI analysis failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      // Fall through to regex path
    }
  }

  // ── Regex path (fallback or when useAI=false) ──

  // Whole file
  if (!existingHashes.has(hashCode(code))) {
    createSnippet({
      title: sourcePath,
      description: `Imported from ${sourcePath}`,
      code,
      language,
      tags: unique([...baseTags, "file"]),
      starred: false,
    });
    existingHashes.add(hashCode(code));
    summary.imported++;
  } else {
    summary.skippedExisting++;
  }

  // Extracted symbols
  if (opts.extractSymbols !== false) {
    const symbols: ExtractedSymbol[] = extractSymbols(code, language);
    for (const sym of symbols) {
      if (existingHashes.has(hashCode(sym.code))) {
        summary.skippedExisting++;
        continue;
      }
      createSnippet({
        title: `${sym.name} (${sourcePath})`,
        description: `${sym.kind} extracted from ${sourcePath}:${sym.line}`,
        code: sym.code,
        language,
        tags: unique([...baseTags, sym.kind]),
        starred: false,
      });
      existingHashes.add(hashCode(sym.code));
      summary.imported++;
    }
  }
}

// ─── Concurrency helper ───

const AI_CONCURRENCY = 4; // tune up if your OpenAI tier allows higher RPM

async function runJobs<T>(jobs: T[], concurrency: number, fn: (job: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const idx = cursor++;
      await fn(jobs[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
}

// ─── Filesystem walker ───

function walkLocal(root: string, maxFiles: number): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    if (out.length >= maxFiles) break;
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (out.length >= maxFiles) break;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name) || ent.name.startsWith(".")) continue;
        stack.push(full);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (!EXT_TO_LANG[ext]) continue;
        out.push(full);
      }
    }
  }
  return out;
}

function shouldSkipPath(p: string): boolean {
  return p.split("/").some((seg) => SKIP_DIRS.has(seg));
}

// ─── GitHub URL parsing ───

function parseGithubUrl(
  raw: string,
): { owner: string; repo: string; ref: string | null; subPath: string | null } | null {
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!/github\.com$/i.test(url.hostname)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, "");
  // /owner/repo/tree/<ref>/<subPath...>
  let ref: string | null = null;
  let subPath: string | null = null;
  if (parts.length >= 4 && (parts[2] === "tree" || parts[2] === "blob")) {
    ref = parts[3];
    if (parts.length > 4) subPath = parts.slice(4).join("/");
  }
  return { owner, repo, ref, subPath };
}

// ─── Helpers ───

function blankSummary(source: string): ImportSummary {
  return {
    imported: 0,
    skippedExisting: 0,
    skippedTooLarge: 0,
    skippedUnsupported: 0,
    errors: [],
    filesProcessed: 0,
    source,
    aiUsed: false,
  };
}

function looksBinary(content: string): boolean {
  // Quick & dirty: presence of NUL byte in the first 4KB
  const sample = content.slice(0, 4096);
  return sample.indexOf(" ") !== -1;
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

// FNV-1a 32-bit hash, fine for dedupe
function hashCode(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}

let _hashCache: Set<string> | null = null;
function getExistingCodeHashes(): Set<string> {
  if (_hashCache) return _hashCache;
  _hashCache = new Set(getEmbeddingRows().map((r) => hashCode(r.snippet.code)));
  return _hashCache;
}
// Reset cache between import runs so concurrent imports stay fresh
export function resetImporterCache(): void {
  _hashCache = null;
}

// Just re-export for convenience
export type { Snippet };

// ─── AI re-titling for already-imported snippets ───

export type RetitleSummary = {
  scanned: number;
  retitled: number;
  skipped: number;
  errors: { id: string; reason: string }[];
};

const RETITLE_CONCURRENCY = 4;

/**
 * Walk every snippet whose title looks like a file path (which is what the
 * regex-based importer produces) and ask GPT-4o-mini to give it a clean
 * functional title + description. Idempotent: snippets already given good
 * titles are skipped.
 */
export async function aiRetitleAll(opts?: { onlyFiles?: boolean }): Promise<RetitleSummary> {
  resetImporterCache();
  const summary: RetitleSummary = { scanned: 0, retitled: 0, skipped: 0, errors: [] };
  const rows = getEmbeddingRows();

  // Decide which snippets need a new title.
  const targets = rows.filter((r) => {
    const s = r.snippet;
    if (opts?.onlyFiles && !s.tags.includes("file")) return false;
    // Heuristic for "looks like a file path or auto-generated name":
    // contains a path separator, has a file extension, or contains parentheses
    // around a path (the regex extractor's "name (path/to/file.ts)" format).
    const t = s.title;
    if (/[\\/]/.test(t)) return true;
    if (/\.(tsx?|jsx?|py|go|rs|java|kt|swift|cs|rb|php|sh|sql|css|html?|json|ya?ml|md)$/i.test(t)) return true;
    if (/\([^)]*\.[a-z]+[^)]*\)$/i.test(t)) return true;
    return false;
  });

  pausePersist();
  try {
    await runJobs(targets, RETITLE_CONCURRENCY, async (r) => {
      summary.scanned++;
      try {
        const fresh = getSnippet(r.id);
        if (!fresh) {
          summary.skipped++;
          return;
        }
        const suggestion = await suggestTitleAndDescription({
          code: fresh.code,
          language: fresh.language,
          currentTitle: fresh.title,
        });
        if (!suggestion) {
          summary.skipped++;
          return;
        }
        const mergedTags = unique([
          ...fresh.tags.filter((t) => t !== "file"),
          ...suggestion.tags,
          "ai-named",
        ]);
        updateSnippet(r.id, {
          title: suggestion.title,
          description: suggestion.description,
          tags: mergedTags,
        });
        summary.retitled++;
      } catch (err) {
        summary.errors.push({
          id: r.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    });
  } finally {
    resumePersist();
  }
  return summary;
}

// ─── Re-extract symbols from already-imported file snippets ───

export type ReindexSummary = {
  filesScanned: number;
  symbolsAdded: number;
  skippedExisting: number;
};

/**
 * Walk every "file"-tagged snippet currently in the store and re-run symbol
 * extraction with the latest patterns. Adds any new function/class/method
 * snippets that weren't already present (deduped by code hash).
 *
 * Use after upgrading symbol extraction patterns or after the user notices
 * search isn't surfacing fine-grained results because everything was
 * imported as a whole-file snippet.
 */
export function reindexExistingFiles(): ReindexSummary {
  resetImporterCache();
  const summary: ReindexSummary = {
    filesScanned: 0,
    symbolsAdded: 0,
    skippedExisting: 0,
  };
  const existingHashes = new Set<string>();
  const rows = getEmbeddingRows();
  for (const r of rows) existingHashes.add(hashCode(r.snippet.code));

  pausePersist();
  try {
    for (const r of rows) {
      const s = r.snippet;
      if (!s.tags.includes("file")) continue;
      summary.filesScanned++;

      const symbols = extractSymbols(s.code, s.language);
      if (symbols.length === 0) continue;

      // Pull a clean source path out of the title (it's `path/to/file.ext`)
      const sourcePath = s.title;
      const baseTags = unique(s.tags.filter((t) => t !== "file"));

      for (const sym of symbols) {
        const h = hashCode(sym.code);
        if (existingHashes.has(h)) {
          summary.skippedExisting++;
          continue;
        }
        createSnippet({
          title: `${sym.name} (${sourcePath})`,
          description: `${sym.kind} extracted from ${sourcePath}:${sym.line}`,
          code: sym.code,
          language: s.language,
          tags: unique([...baseTags, sym.kind]),
          starred: false,
        });
        existingHashes.add(h);
        summary.symbolsAdded++;
      }
    }
  } finally {
    resumePersist();
  }
  return summary;
}
