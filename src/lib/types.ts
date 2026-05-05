export type Snippet = {
  id: string;
  title: string;
  description: string;
  code: string;
  language: string;
  tags: string[];
  starred: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SnippetWithScore = Snippet & {
  score?: number;
  matchType?: "semantic" | "keyword" | "exact";
};

export type SnippetInput = {
  title: string;
  description?: string;
  code: string;
  language?: string;
  tags?: string[];
  starred?: boolean;
};

export type SearchResult = {
  query: string;
  mode: "semantic" | "keyword";
  results: SnippetWithScore[];
  tookMs: number;
};

export const SUPPORTED_LANGUAGES = [
  "typescript",
  "javascript",
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
  "html",
  "css",
  "json",
  "yaml",
  "markdown",
  "plaintext",
] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];
