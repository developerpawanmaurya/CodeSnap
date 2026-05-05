"use client";

import { memo, useState } from "react";
import { Check, Copy, Pencil, Star, Trash2, Sparkles } from "lucide-react";
import { SyntaxHighlighter, codeTheme } from "./highlighter";
import type { SnippetWithScore } from "@/lib/types";

type Props = {
  snippet: SnippetWithScore;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStar: () => void;
  onTagClick?: (tag: string) => void;
};

export const SnippetCard = memo(SnippetCardImpl, (prev, next) => {
  // Only re-render if the snippet actually changed in a visible way.
  return (
    prev.snippet.id === next.snippet.id &&
    prev.snippet.updatedAt === next.snippet.updatedAt &&
    prev.snippet.starred === next.snippet.starred &&
    prev.snippet.score === next.snippet.score
  );
});

function SnippetCardImpl({ snippet, onEdit, onDelete, onToggleStar, onTagClick }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };

  const score = snippet.score;
  const showScore = typeof score === "number" && snippet.matchType === "semantic";

  return (
    <article className="glass fade-in group flex flex-col rounded-2xl p-4 transition hover:border-bg-border/80">
      <header className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-ink">{snippet.title}</h3>
            {showScore && (
              <span
                title={`Semantic similarity: ${(score! * 100).toFixed(1)}%`}
                className="flex items-center gap-1 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent"
              >
                <Sparkles className="h-3 w-3" />
                {Math.round(score! * 100)}%
              </span>
            )}
          </div>
          {snippet.description && (
            <p className="mt-0.5 truncate text-xs text-ink-muted">{snippet.description}</p>
          )}
        </div>
        <button
          onClick={onToggleStar}
          className="btn-icon"
          title={snippet.starred ? "Unstar" : "Star"}
        >
          <Star
            className={`h-4 w-4 ${
              snippet.starred ? "fill-amber-400 text-amber-400" : ""
            }`}
          />
        </button>
      </header>

      <div className="relative -mx-4 flex-1 overflow-hidden border-y border-bg-border bg-bg/40">
        <div className="max-h-[220px] overflow-auto">
          <SyntaxHighlighter
            language={mapLanguage(snippet.language)}
            style={codeTheme}
            customStyle={{
              margin: 0,
              padding: "12px 16px",
              background: "transparent",
              fontSize: "12.5px",
            }}
            wrapLongLines={false}
          >
            {truncateCode(snippet.code)}
          </SyntaxHighlighter>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-bg/80 to-transparent" />
      </div>

      <footer className="mt-3 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-muted">
            {snippet.language}
          </span>
          {snippet.tags.slice(0, 3).map((t) => (
            <button
              key={t}
              onClick={() => onTagClick?.(t)}
              className="tag-chip hover:border-accent/40 hover:text-accent"
            >
              #{t}
            </button>
          ))}
          {snippet.tags.length > 3 && (
            <span className="text-[10px] text-ink-dim">+{snippet.tags.length - 3}</span>
          )}
        </div>

        <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <button onClick={copy} className="btn-icon" title="Copy code">
            {copied ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
          <button onClick={onEdit} className="btn-icon" title="Edit">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={onDelete} className="btn-icon hover:!text-red-400" title="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </footer>
    </article>
  );
}

// Map our language identifiers to Prism's. Anything not registered falls back
// to plain text rendering (still fast, just no colors).
function mapLanguage(lang: string): string {
  const known = new Set([
    "typescript",
    "javascript",
    "jsx",
    "tsx",
    "python",
    "go",
    "rust",
    "java",
    "csharp",
    "ruby",
    "php",
    "swift",
    "kotlin",
    "bash",
    "sql",
    "css",
    "html",
    "json",
    "yaml",
    "markdown",
  ]);
  return known.has(lang) ? lang : "text";
}

// Don't try to highlight 5000-line files inside a card preview.
const MAX_PREVIEW_CHARS = 4000;
function truncateCode(code: string): string {
  if (code.length <= MAX_PREVIEW_CHARS) return code;
  return code.slice(0, MAX_PREVIEW_CHARS) + "\n\n// … truncated for preview, click Edit to view full snippet";
}
