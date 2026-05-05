"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Save, Sparkles, Star, X } from "lucide-react";
import { SUPPORTED_LANGUAGES, type Snippet, type SnippetInput } from "@/lib/types";

type Props = {
  snippet: Snippet | null;
  onClose: () => void;
  onSave: (input: SnippetInput) => Promise<void>;
};

export function SnippetEditor({ snippet, onClose, onSave }: Props) {
  const [title, setTitle] = useState(snippet?.title || "");
  const [description, setDescription] = useState(snippet?.description || "");
  const [code, setCode] = useState(snippet?.code || "");
  const [language, setLanguage] = useState(snippet?.language || "typescript");
  const [tagsRaw, setTagsRaw] = useState((snippet?.tags || []).join(", "));
  const [starred, setStarred] = useState(snippet?.starred || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  // Latest-callbacks ref so the global keydown listener never holds stale state.
  const handlersRef = useRef({ onClose, submit: () => Promise.resolve() });

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handlersRef.current.onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handlersRef.current.submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-detect language only on the very first paste of a brand-new snippet.
  const autoDetectedRef = useRef(false);
  useEffect(() => {
    if (snippet || !code || autoDetectedRef.current) return;
    const guess = detectLanguage(code);
    if (guess) {
      setLanguage(guess);
      autoDetectedRef.current = true;
    }
  }, [code, snippet]);

  // Keep the ref pointed at the live callbacks every render so keyboard
  // shortcuts always run against current state.
  handlersRef.current = { onClose, submit: () => submit() };

  async function submit() {
    if (!code.trim()) {
      setError("Code can't be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const tags = tagsRaw
        .split(",")
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean);
      await onSave({
        title: title.trim() || "Untitled",
        description: description.trim(),
        code,
        language,
        tags,
        starred,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass fade-in flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-bg-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-medium">{snippet ? "Edit snippet" : "New snippet"}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStarred((v) => !v)}
              className="btn-icon"
              title={starred ? "Unstar" : "Star"}
            >
              <Star
                className={`h-4 w-4 ${starred ? "fill-amber-400 text-amber-400" : ""}`}
              />
            </button>
            <button onClick={onClose} className="btn-icon">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <input
            ref={titleRef}
            type="text"
            placeholder="Title — what is this snippet?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input text-base font-medium"
          />

          <textarea
            placeholder="Optional description — the more context you add, the better AI search works."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="input resize-none"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-ink-dim">
                Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="input"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-ink-dim">
                Tags (comma-separated)
              </label>
              <input
                type="text"
                placeholder="e.g. react, hooks, validation"
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-ink-dim">
              Code
            </label>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              rows={14}
              placeholder="Paste your code here…"
              className="w-full rounded-lg border border-bg-border bg-bg/60 p-3 font-mono text-[13px] text-ink placeholder:text-ink-dim focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-glow"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-bg-border px-5 py-3 text-xs text-ink-dim">
          <span>
            <span className="kbd">Esc</span> to close · <span className="kbd">⌘↵</span> to save
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn btn-ghost">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="btn btn-primary disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {snippet ? "Save changes" : "Create snippet"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function detectLanguage(code: string): string | null {
  const t = code.trim();
  if (/^\s*(import .* from|export (default|const|function)|interface |type \w+ =)/m.test(t))
    return "typescript";
  if (/^\s*(def |import |from .* import|class \w+:)/m.test(t)) return "python";
  if (/^\s*(package |func |import \()/m.test(t)) return "go";
  if (/^\s*(fn |let mut |use std::)/m.test(t)) return "rust";
  if (/^\s*(SELECT |INSERT |UPDATE |DELETE |CREATE TABLE)/im.test(t)) return "sql";
  if (/^\s*(#!\/(usr\/)?bin\/(ba)?sh|^\s*(echo|grep|sed|awk|curl) )/m.test(t)) return "bash";
  if (/^\s*(<\w+[^>]*>|<!DOCTYPE)/m.test(t)) return "html";
  if (/^\s*(\.|#)\w[\w-]*\s*\{/m.test(t)) return "css";
  if (/^\s*[{[]/.test(t) && /[}\]]\s*$/.test(t)) return "json";
  return null;
}
