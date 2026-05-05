import { NextRequest, NextResponse } from "next/server";
import { ftsSearch, seedIfEmpty } from "@/lib/db";
import { embeddingsAvailable, semanticSearch } from "@/lib/embeddings";
import type { SearchResult, SnippetWithScore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  seedIfEmpty();
  const start = Date.now();

  try {
    const body = await req.json();
    const query = (body.query || "").toString().trim();
    const mode = body.mode === "keyword" ? "keyword" : "semantic";
    const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 50);

    if (!query) {
      return NextResponse.json({ query: "", mode, results: [], tookMs: 0 } satisfies SearchResult);
    }

    let results: SnippetWithScore[] = [];
    let actualMode: "semantic" | "keyword" = mode;

    if (mode === "semantic" && embeddingsAvailable()) {
      try {
        results = await semanticSearch({ query, limit });
      } catch (err) {
        // Fall back to keyword search if embeddings call fails (rate limit, network, etc.)
        console.error("semanticSearch failed, falling back to FTS:", err);
        actualMode = "keyword";
      }
    } else {
      actualMode = "keyword";
    }

    if (results.length === 0) {
      const fts = ftsSearch(query, limit);
      const lower = query.toLowerCase();
      results = fts.map((s) => {
        const haystack = (s.title + " " + s.description + " " + s.code + " " + s.tags.join(" ")).toLowerCase();
        const occurrences = haystack.split(lower).length - 1;
        return {
          ...s,
          score: Math.min(1, occurrences / 5),
          matchType: "keyword" as const,
        };
      });
      if (mode === "semantic" && results.length > 0) actualMode = "keyword";
    }

    const result: SearchResult = {
      query,
      mode: actualMode,
      results,
      tookMs: Date.now() - start,
    };
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "search failed" },
      { status: 400 },
    );
  }
}
