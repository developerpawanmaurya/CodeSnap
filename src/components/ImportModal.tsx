"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FolderOpen,
  Github,
  Loader2,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";

type Tab = "local" | "github";

type ReindexSummary = {
  filesScanned: number;
  symbolsAdded: number;
  skippedExisting: number;
};

type RetitleSummary = {
  scanned: number;
  retitled: number;
  skipped: number;
  errors: { id: string; reason: string }[];
};

type ImportSummary = {
  imported: number;
  skippedExisting: number;
  skippedTooLarge: number;
  skippedUnsupported: number;
  errors: { path: string; reason: string }[];
  filesProcessed: number;
  source: string;
  aiUsed?: boolean;
};

type Props = {
  onClose: () => void;
  onImported: () => void;
};

export function ImportModal({ onClose, onImported }: Props) {
  const [tab, setTab] = useState<Tab>("github");
  const [target, setTarget] = useState("");
  const [extractSymbols, setExtractSymbols] = useState(true);
  const [useAI, setUseAI] = useState(true);
  const [maxFiles, setMaxFiles] = useState(60);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [reindexResult, setReindexResult] = useState<ReindexSummary | null>(null);
  const [retitleResult, setRetitleResult] = useState<RetitleSummary | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !running) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, running]);

  async function reindex() {
    setRunning(true);
    setError(null);
    setSummary(null);
    setReindexResult(null);
    setRetitleResult(null);
    try {
      const res = await fetch("/api/reindex", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Reindex failed");
      setReindexResult(json.summary as ReindexSummary);
      if (json.summary?.symbolsAdded > 0) onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reindex failed");
    } finally {
      setRunning(false);
    }
  }

  async function retitle() {
    setRunning(true);
    setError(null);
    setSummary(null);
    setReindexResult(null);
    setRetitleResult(null);
    try {
      const res = await fetch("/api/retitle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ onlyFiles: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Re-title failed");
      setRetitleResult(json.summary as RetitleSummary);
      if (json.summary?.retitled > 0) onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-title failed");
    } finally {
      setRunning(false);
    }
  }

  async function start() {
    if (!target.trim()) {
      setError(tab === "github" ? "Paste a GitHub URL." : "Paste an absolute folder path.");
      return;
    }
    setRunning(true);
    setError(null);
    setSummary(null);
    setReindexResult(null);
    setRetitleResult(null);

    try {
      const body =
        tab === "github"
          ? { source: "github", url: target.trim(), extractSymbols, useAI, maxFiles }
          : { source: "local", path: target.trim(), extractSymbols, useAI, maxFiles };

      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");
      setSummary(json.summary as ImportSummary);
      if (json.summary?.imported > 0) onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => !running && onClose()}
    >
      <div
        className="glass fade-in flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-bg-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-medium">Import code as snippets</h2>
          </div>
          <button onClick={onClose} disabled={running} className="btn-icon disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Tabs */}
          <div className="flex rounded-lg border border-bg-border bg-bg/60 p-0.5 text-sm">
            <button
              onClick={() => setTab("github")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 transition ${
                tab === "github" ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
              }`}
            >
              <Github className="h-4 w-4" /> GitHub URL
            </button>
            <button
              onClick={() => setTab("local")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 transition ${
                tab === "local" ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
              }`}
            >
              <FolderOpen className="h-4 w-4" /> Local folder
            </button>
          </div>

          {tab === "github" ? (
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-ink-dim">
                Public GitHub repo URL
              </label>
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="https://github.com/vercel/next.js or github.com/owner/repo/tree/main/packages/foo"
                className="input"
                disabled={running}
              />
              <p className="mt-2 text-xs text-ink-dim">
                Works on public repos out of the box. For private repos or to lift the 60 req/hour rate
                limit, set <span className="kbd">GITHUB_TOKEN</span> in your <span className="kbd">.env</span>.
              </p>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-ink-dim">
                Absolute folder path
              </label>
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="C:\dev\my-project   or   /Users/me/code/my-project"
                className="input font-mono"
                disabled={running}
              />
              <p className="mt-2 text-xs text-ink-dim">
                Reads files directly from disk via the local Next.js server. node_modules / dist /
                .git / build / .next / venv etc. are skipped automatically.
              </p>
            </div>
          )}

          {/* Options */}
          <div className="space-y-3 rounded-xl border border-bg-border bg-bg/40 p-3 text-sm">
            <label className="flex cursor-pointer items-start justify-between gap-3">
              <span className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
                <span>
                  <span className="block">Use AI to name & split snippets (recommended)</span>
                  <span className="mt-0.5 block text-xs text-ink-dim">
                    GPT-4o-mini analyzes each file and creates well-titled snippets per
                    functionality, keeping mixed-language code (PHP+HTML+JS) together. Costs
                    ~$0.001 per file. Disable for free regex-based extraction.
                  </span>
                </span>
              </span>
              <input
                type="checkbox"
                checked={useAI}
                onChange={(e) => setUseAI(e.target.checked)}
                disabled={running}
                className="mt-1 h-4 w-4 flex-shrink-0 cursor-pointer accent-accent"
              />
            </label>

            <label className={`flex cursor-pointer items-center justify-between ${useAI ? "opacity-50" : ""}`}>
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-ink-muted" />
                <span>Also extract functions / classes (regex fallback)</span>
              </span>
              <input
                type="checkbox"
                checked={extractSymbols}
                onChange={(e) => setExtractSymbols(e.target.checked)}
                disabled={running || useAI}
                className="h-4 w-4 cursor-pointer accent-accent"
              />
            </label>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-ink-muted">Max files to scan</span>
              <input
                type="number"
                min={1}
                max={2000}
                value={maxFiles}
                onChange={(e) => setMaxFiles(Math.max(1, Number(e.target.value) || 1))}
                disabled={running}
                className="w-24 rounded-md border border-bg-border bg-bg-elevated px-2 py-1 text-right text-sm text-ink focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          {/* Fix existing imports */}
          <div className="space-y-2 rounded-xl border border-bg-border bg-bg/40 p-3 text-sm">
            <div className="flex items-start gap-2">
              <Wand2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
              <div>
                <div className="font-medium text-ink">Fix bad existing snippets</div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Already imported a project but the snippets are huge whole files with file-path
                  titles? Re-title them with AI (clear functional names) or split them apart with regex.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={retitle}
                disabled={running}
                className="btn btn-primary flex-1 justify-center disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" /> Re-title with AI
              </button>
              <button
                onClick={reindex}
                disabled={running}
                className="btn btn-ghost border border-bg-border flex-1 justify-center disabled:opacity-50"
              >
                <Wand2 className="h-4 w-4" /> Re-extract symbols (regex)
              </button>
            </div>
          </div>

          {/* Reindex result */}
          {reindexResult && (
            <div className="space-y-2 rounded-xl border border-accent/20 bg-accent/5 p-3 text-sm">
              <div className="flex items-center gap-2 text-accent">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">
                  Added {reindexResult.symbolsAdded} new function/class snippets
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-ink-muted">
                <Stat label="Files re-scanned" value={reindexResult.filesScanned} />
                <Stat label="Already existed" value={reindexResult.skippedExisting} />
              </div>
            </div>
          )}

          {/* Re-title result */}
          {retitleResult && (
            <div className="space-y-2 rounded-xl border border-accent/20 bg-accent/5 p-3 text-sm">
              <div className="flex items-center gap-2 text-accent">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">
                  Re-titled {retitleResult.retitled} snippets with AI
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-ink-muted">
                <Stat label="Snippets scanned" value={retitleResult.scanned} />
                <Stat label="Skipped" value={retitleResult.skipped} />
              </div>
              {retitleResult.errors.length > 0 && (
                <details className="text-xs text-ink-dim">
                  <summary className="cursor-pointer">{retitleResult.errors.length} errors</summary>
                  <ul className="mt-1 max-h-32 overflow-y-auto pl-3">
                    {retitleResult.errors.slice(0, 30).map((e, i) => (
                      <li key={i} className="truncate">
                        {e.id}: {e.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Summary */}
          {summary && (
            <div className="space-y-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm">
              <div className="flex items-center gap-2 text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                <span className="font-medium">
                  Imported {summary.imported} snippets
                  {summary.aiUsed && <span className="ml-2 text-xs font-normal text-accent">(AI-named)</span>}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-ink-muted">
                <Stat label="Files processed" value={summary.filesProcessed} />
                <Stat label="Already existed" value={summary.skippedExisting} />
                <Stat label="Skipped (too big)" value={summary.skippedTooLarge} />
                <Stat label="Skipped (unsupported)" value={summary.skippedUnsupported} />
              </div>
              {summary.errors.length > 0 && (
                <details className="text-xs text-ink-dim">
                  <summary className="cursor-pointer">{summary.errors.length} errors</summary>
                  <ul className="mt-1 max-h-32 overflow-y-auto pl-3">
                    {summary.errors.slice(0, 30).map((e, i) => (
                      <li key={i} className="truncate">
                        {e.path}: {e.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="text-[11px] text-ink-dim">Source: {summary.source}</div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-bg-border px-5 py-3 text-xs text-ink-dim">
          <span>
            <span className="kbd">Esc</span> to close
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={running} className="btn btn-ghost disabled:opacity-50">
              {summary ? "Done" : "Cancel"}
            </button>
            <button
              onClick={start}
              disabled={running || !target.trim()}
              className="btn btn-primary disabled:opacity-50"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Start import
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-bg-elevated/50 px-2 py-1">
      <span>{label}</span>
      <span className="font-mono text-ink">{value}</span>
    </div>
  );
}
