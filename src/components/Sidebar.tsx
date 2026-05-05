"use client";

import { Code2, Hash, Star, Layers, Sparkles } from "lucide-react";

type Props = {
  tags: { tag: string; count: number }[];
  activeTag: string | null;
  showStarred: boolean;
  totalCount: number;
  onSelectTag: (tag: string) => void;
  onToggleStarred: () => void;
  onClearFilters: () => void;
};

export function Sidebar({
  tags,
  activeTag,
  showStarred,
  totalCount,
  onSelectTag,
  onToggleStarred,
  onClearFilters,
}: Props) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 flex-shrink-0 flex-col border-r border-bg-border bg-bg-surface/40 px-4 py-6 lg:flex">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
          <Code2 className="h-4 w-4" />
        </div>
        <span className="font-semibold tracking-tight">CodeSnap</span>
      </div>

      <nav className="flex flex-col gap-1 text-sm">
        <NavItem
          icon={<Layers className="h-4 w-4" />}
          label="All snippets"
          count={totalCount}
          active={!showStarred && !activeTag}
          onClick={onClearFilters}
        />
        <NavItem
          icon={<Star className="h-4 w-4" />}
          label="Starred"
          active={showStarred}
          onClick={onToggleStarred}
        />
      </nav>

      <div className="mt-6 mb-2 flex items-center justify-between px-2">
        <span className="text-[11px] uppercase tracking-wider text-ink-dim">Tags</span>
        <span className="text-[11px] text-ink-dim">{tags.length}</span>
      </div>

      <div className="-mx-1 flex-1 overflow-y-auto px-1">
        {tags.length === 0 ? (
          <p className="px-3 py-2 text-xs text-ink-dim">No tags yet.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {tags.map(({ tag, count }) => (
              <li key={tag}>
                <button
                  onClick={() => onSelectTag(tag)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm transition ${
                    activeTag === tag
                      ? "bg-accent/15 text-accent"
                      : "text-ink-muted hover:bg-bg-elevated hover:text-ink"
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Hash className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{tag}</span>
                  </span>
                  <span className="ml-2 text-[11px] text-ink-dim">{count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-bg-border bg-bg-elevated/50 p-3 text-xs text-ink-muted">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-ink">
          <Sparkles className="h-3.5 w-3.5 text-accent" /> AI Search
        </div>
        Search by intent, not just keywords. Try a description of what the code does.
      </div>
    </aside>
  );
}

function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between rounded-md px-3 py-2 transition ${
        active ? "bg-accent/15 text-accent" : "text-ink-muted hover:bg-bg-elevated hover:text-ink"
      }`}
    >
      <span className="flex items-center gap-2">
        {icon} {label}
      </span>
      {count !== undefined && <span className="text-[11px] text-ink-dim">{count}</span>}
    </button>
  );
}
