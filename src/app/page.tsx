"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Code2,
  Download,
  Plus,
  Search,
  Sparkles,
  Star,
  Tag as TagIcon,
  Loader2,
  Filter,
  X,
} from "lucide-react";
import type { Snippet, SnippetInput, SnippetWithScore } from "@/lib/types";
import { SnippetCard } from "@/components/SnippetCard";
import { SnippetEditor } from "@/components/SnippetEditor";
import { Sidebar } from "@/components/Sidebar";
import { ImportModal } from "@/components/ImportModal";
import { useDebounce } from "@/lib/useDebounce";

type SearchMode = "semantic" | "keyword";

export default function DashboardPage() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [results, setResults] = useState<SnippetWithScore[] | null>(null);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("semantic");
  const [searching, setSearching] = useState(false);
  const [searchTook, setSearchTook] = useState<number | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showStarred, setShowStarred] = useState(false);
  const [editing, setEditing] = useState<Snippet | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query, 350);
  const searchAbort = useRef<AbortController | null>(null);

  const refreshSnippets = useCallback(async () => {
    const params = new URLSearchParams();
    if (activeTag) params.set("tag", activeTag);
    if (showStarred) params.set("starred", "true");
    const res = await fetch(`/api/snippets?${params.toString()}`);
    const json = await res.json();
    setSnippets(json.snippets || []);
  }, [activeTag, showStarred]);

  const refreshTags = useCallback(async () => {
    const res = await fetch("/api/tags");
    const json = await res.json();
    setTags(json.tags || []);
  }, []);

  useEffect(() => {
    refreshSnippets();
    refreshTags();
  }, [refreshSnippets, refreshTags]);

  // Run search when query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults(null);
      setSearchTook(null);
      return;
    }

    searchAbort.current?.abort();
    const ctrl = new AbortController();
    searchAbort.current = ctrl;

    setSearching(true);
    setError(null);

    fetch("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: debouncedQuery, mode: searchMode }),
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((json) => {
        if (ctrl.signal.aborted) return;
        if (json.error) {
          setError(json.error);
          setResults([]);
          return;
        }
        setResults(json.results || []);
        setSearchTook(json.tookMs ?? null);
        // If user picked semantic but server fell back, surface that
        if (searchMode === "semantic" && json.mode === "keyword") {
          setError("Semantic search unavailable — showing keyword matches.");
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message || "Search failed");
        setResults([]);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setSearching(false);
      });
  }, [debouncedQuery, searchMode]);

  const handleSave = async (input: SnippetInput) => {
    const isEdit = !!editing;
    const url = isEdit ? `/api/snippets/${editing!.id}` : "/api/snippets";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error || "Save failed");
    }
    setEditing(null);
    setCreating(false);
    await Promise.all([refreshSnippets(), refreshTags()]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this snippet? This cannot be undone.")) return;
    const res = await fetch(`/api/snippets/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Couldn't delete snippet — try again.");
      return;
    }
    await Promise.all([refreshSnippets(), refreshTags()]);
  };

  const handleToggleStar = async (s: Snippet) => {
    await fetch(`/api/snippets/${s.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ starred: !s.starred }),
    });
    refreshSnippets();
  };

  const visible = useMemo<SnippetWithScore[]>(() => {
    if (results !== null) return results;
    return snippets.map((s) => ({ ...s }));
  }, [results, snippets]);

  // ⌘K / Ctrl+K to focus search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("search-input")?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        setCreating(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        tags={tags}
        activeTag={activeTag}
        showStarred={showStarred}
        totalCount={snippets.length}
        onSelectTag={(t) => setActiveTag(t === activeTag ? null : t)}
        onToggleStarred={() => setShowStarred((v) => !v)}
        onClearFilters={() => {
          setActiveTag(null);
          setShowStarred(false);
        }}
      />

      <main className="flex-1 px-8 py-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <header className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Code2 className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight">CodeSnap</h1>
            <p className="text-xs text-ink-dim">AI-powered snippet manager</p>
          </div>
          <button onClick={() => setImporting(true)} className="btn btn-ghost border border-bg-border">
            <Download className="h-4 w-4" /> Import
          </button>
          <button onClick={() => setCreating(true)} className="btn btn-primary">
            <Plus className="h-4 w-4" /> New snippet
            <span className="kbd ml-1">⌘N</span>
          </button>
        </header>

        {/* Search bar */}
        <div className="glass mb-6 rounded-2xl p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" />
            <input
              id="search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Try "function that validates email with regex" or "react debounce hook"'
              className="w-full rounded-xl border border-bg-border bg-bg/60 py-3 pl-11 pr-32 text-sm text-ink placeholder:text-ink-dim focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-glow"
            />
            <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
              {query && (
                <button onClick={() => setQuery("")} className="btn-icon">
                  <X className="h-4 w-4" />
                </button>
              )}
              <span className="kbd">⌘K</span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-bg-border bg-bg/60 p-0.5 text-xs">
              <button
                onClick={() => setSearchMode("semantic")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
                  searchMode === "semantic" ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" /> AI Semantic
              </button>
              <button
                onClick={() => setSearchMode("keyword")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
                  searchMode === "keyword" ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
                }`}
              >
                <Filter className="h-3.5 w-3.5" /> Keyword
              </button>
            </div>

            <div className="flex-1" />

            {searching && (
              <span className="flex items-center gap-2 text-xs text-ink-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching…
              </span>
            )}
            {!searching && results && (
              <span className="text-xs text-ink-dim">
                {results.length} {results.length === 1 ? "match" : "matches"}
                {searchTook !== null && ` · ${searchTook}ms`}
              </span>
            )}
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
              {error}
            </div>
          )}
        </div>

        {/* Active filters */}
        {(activeTag || showStarred) && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-ink-dim">Filters:</span>
            {showStarred && (
              <span className="tag-chip">
                <Star className="h-3 w-3 fill-current text-amber-400" /> starred
                <button onClick={() => setShowStarred(false)} className="ml-1 hover:text-ink">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {activeTag && (
              <span className="tag-chip">
                <TagIcon className="h-3 w-3" /> {activeTag}
                <button onClick={() => setActiveTag(null)} className="ml-1 hover:text-ink">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
        )}

        {/* Snippets grid */}
        {visible.length === 0 ? (
          <EmptyState
            isSearch={!!results}
            onCreate={() => setCreating(true)}
            query={debouncedQuery}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((s) => (
              <SnippetCard
                key={s.id}
                snippet={s}
                onEdit={() => setEditing(s)}
                onDelete={() => handleDelete(s.id)}
                onToggleStar={() => handleToggleStar(s)}
                onTagClick={(t) => setActiveTag(t)}
              />
            ))}
          </div>
        )}

        {/* Editor modal */}
        {(creating || editing) && (
          <SnippetEditor
            snippet={editing}
            onClose={() => {
              setCreating(false);
              setEditing(null);
            }}
            onSave={handleSave}
          />
        )}

        {/* Import modal */}
        {importing && (
          <ImportModal
            onClose={() => setImporting(false)}
            onImported={() => {
              refreshSnippets();
              refreshTags();
            }}
          />
        )}
      </main>
    </div>
  );
}

function EmptyState({
  isSearch,
  onCreate,
  query,
}: {
  isSearch: boolean;
  onCreate: () => void;
  query: string;
}) {
  return (
    <div className="glass flex flex-col items-center justify-center rounded-2xl py-20 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-elevated">
        {isSearch ? (
          <Search className="h-6 w-6 text-ink-dim" />
        ) : (
          <Code2 className="h-6 w-6 text-ink-dim" />
        )}
      </div>
      <h3 className="text-base font-medium text-ink">
        {isSearch ? `No matches for "${query}"` : "No snippets yet"}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-ink-dim">
        {isSearch
          ? "Try a different phrasing — semantic search works best with descriptive queries."
          : "Save your first snippet to get started. It'll be instantly searchable across all your devices."}
      </p>
      {!isSearch && (
        <button onClick={onCreate} className="btn btn-primary mt-5">
          <Plus className="h-4 w-4" /> Create snippet
        </button>
      )}
    </div>
  );
}
