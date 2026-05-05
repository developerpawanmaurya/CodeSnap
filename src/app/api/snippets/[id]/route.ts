import { NextRequest, NextResponse } from "next/server";
import { deleteSnippet, getSnippet, updateSnippet } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const snippet = getSnippet(params.id);
  if (!snippet) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ snippet });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const snippet = updateSnippet(params.id, {
      title: body.title,
      description: body.description,
      code: body.code,
      language: body.language,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
      starred: typeof body.starred === "boolean" ? body.starred : undefined,
    });
    if (!snippet) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ snippet });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "bad request" },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ok = deleteSnippet(params.id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
