# CodeSnap

A smart code snippet manager with **real AI semantic search**. Save once, find forever — even when you can only remember "that function that validates email with regex".

Built with Next.js 14 (App Router), a pure-JS JSON file store (zero native dependencies), and OpenAI embeddings.

## Features

- **Bulk import from local folder or GitHub URL** — point it at `C:\dev\my-project` or `github.com/owner/repo`, get one snippet per file plus optionally one per top-level function/class/struct.
- **AI semantic search** — describe what code does, not what it's called. Powered by OpenAI's `text-embedding-3-small` with cosine similarity ranking.
- **Keyword fallback** — multi-token substring search when you'd rather match exact terms (also used as a graceful fallback if the embeddings API is unreachable).
- **CRUD with auto-tagging** — create, edit, star, delete snippets. Tags + language filters in the sidebar.
- **Syntax highlighting** for 19+ languages.
- **Auto-detect language** when you paste code.
- **Keyboard-first** — `⌘K` / `Ctrl+K` to focus search, `⌘N` for new, `⌘↵` to save, `Esc` to close.
- **Instant similarity scores** — every semantic match shows its match confidence so you can tell good hits from noise.
- **Sample snippets seeded** on first run so the dashboard isn't empty.

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure your OpenAI key
cp .env.example .env
# Edit .env and paste your key from https://platform.openai.com/api-keys

# 3. Run the dev server
npm run dev
```

Open http://localhost:3000 — sample snippets are seeded on first request and the dataset is persisted to `data/codesnap.json`.

> Without `OPENAI_API_KEY`, the app still works — semantic search gracefully falls back to keyword search.

## Architecture

```
codesnap/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── snippets/route.ts        GET list, POST create
│   │   │   ├── snippets/[id]/route.ts   GET, PUT, DELETE
│   │   │   ├── search/route.ts          POST semantic + keyword
│   │   │   └── tags/route.ts            GET tag aggregation
│   │   ├── layout.tsx
│   │   ├── page.tsx                      Dashboard
│   │   └── globals.css
│   ├── components/
│   │   ├── Sidebar.tsx                   Tag + filter navigation
│   │   ├── SnippetCard.tsx               Snippet card with copy/edit/star
│   │   └── SnippetEditor.tsx             Modal create/edit
│   └── lib/
│       ├── db.ts                         JSON file store + keyword search
│       ├── embeddings.ts                 OpenAI embeddings + cosine sim
│       ├── types.ts
│       └── useDebounce.ts
├── .env.example
├── next.config.js
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## How semantic search works

1. When a snippet is saved, its title + description + tags + code are concatenated into an "embedding text".
2. On the **first search**, any snippets without embeddings are batched up and sent to OpenAI's embeddings API (32 at a time). The 1536-dim vectors are persisted alongside the snippet in `data/codesnap.json`.
3. The user's query is embedded with the same model, then cosine similarity is computed in-memory across all snippets.
4. Results above a 0.2 similarity threshold are returned, sorted by score.

This is fast enough for thousands of snippets without needing a vector database or even a real DB. To scale beyond ~50k snippets, swap `lib/db.ts` for a SQLite/Postgres+pgvector backend — the storage interface (`listSnippets`, `getEmbeddingRows`, `setEmbedding`, `ftsSearch`) is the only thing the rest of the app depends on.

## Importing existing code

Click **Import** in the dashboard header to bulk-import code from either:

- **A local folder** — paste an absolute path (`C:\dev\my-project` or `/Users/me/code/foo`). The Next.js server reads files directly from disk. `node_modules`, `.git`, `.next`, `dist`, `build`, `target`, `__pycache__`, `venv`, etc. are skipped automatically. Files larger than 100KB are skipped.
- **A public GitHub URL** — paste anything like `https://github.com/owner/repo` or `github.com/owner/repo/tree/main/packages/foo` to scope to a subfolder. Public repos work without auth; for private repos or to lift the 60 req/hour rate limit, set `GITHUB_TOKEN` in `.env`.

For each accepted file you get one whole-file snippet, and optionally one snippet per extracted symbol — top-level `function`, `class`, `interface`, `struct`, `impl`, `trait`, `def`, etc. Symbol extraction is regex + brace-balanced (not a real parser); good for the 80% common case across TS/JS, Python, Go, Rust, Java, C#, Kotlin, Swift.

Imports auto-tag with: the source repo/folder name, the language, the first few directory segments, and `file` or the symbol kind. Snippets are deduplicated by exact code-body hash, so re-running an import just adds new content.

## API

| Method | Path                 | Description                              |
| ------ | -------------------- | ---------------------------------------- |
| GET    | `/api/snippets`      | List snippets. Query: `tag`, `language`, `starred=true` |
| POST   | `/api/snippets`      | Create snippet. Body: `{title, description, code, language, tags[], starred}` |
| GET    | `/api/snippets/:id`  | Fetch one                                |
| PUT    | `/api/snippets/:id`  | Update (any subset of fields)            |
| DELETE | `/api/snippets/:id`  | Delete                                   |
| POST   | `/api/search`        | Body: `{query, mode: "semantic"\|"keyword", limit}` |
| POST   | `/api/import`        | Body: `{source: "local"\|"github", path\|url, extractSymbols, maxFiles, tags[]}` |
| GET    | `/api/tags`          | Tag aggregation with counts              |

## Environment

```
OPENAI_API_KEY=sk-...                     # required for AI search
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
DATABASE_PATH=./data/codesnap.json
DISABLE_EMBEDDINGS=true                   # optional override
GITHUB_TOKEN=ghp_...                      # optional, raises GitHub rate limits
```

## Roadmap

This is the web dashboard MVP. Natural extensions:

- **Browser extension** that POSTs to `/api/snippets` from any "copy" event with the page URL as a tag.
- **VS Code extension** using the same API plus a `cmd+shift+s` keybinding to save the active selection.
- **Team sharing** via a `workspaces` table with member roles.
- **Version history** — append-only `snippet_versions` table on every update.
- **Embedding cache invalidation** — currently invalidated on edit; could be debounced for large bulk imports.

## License

MIT
