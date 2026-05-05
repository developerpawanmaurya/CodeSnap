import { NextRequest, NextResponse } from "next/server";
import { createSnippet, listSnippets, seedIfEmpty } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  seedIfEmpty();
  const { searchParams } = new URL(req.url);
  const tag = searchParams.get("tag") || undefined;
  const language = searchParams.get("language") || undefined;
  const starred = searchParams.get("starred") === "true" ? true : undefined;

  const snippets = listSnippets({ tag, language, starred });
  return NextResponse.json({ snippets });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.code || typeof body.code !== "string") {
      return NextResponse.json({ error: "code is required" }, { status: 400 });
    }
    const snippet = createSnippet({
      title: body.title || "Untitled",
      description: body.description,
      code: body.code,
      language: body.language,
      tags: Array.isArray(body.tags) ? body.tags : [],
      starred: !!body.starred,
    });
    return NextResponse.json({ snippet }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "bad request" },
      { status: 400 },
    );
  }
}
