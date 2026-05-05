import { NextRequest, NextResponse } from "next/server";
import {
  importFromGithub,
  importFromLocal,
  resetImporterCache,
  type ImportSummary,
} from "@/lib/importer";

export const dynamic = "force-dynamic";
// AI imports can take a while (one OpenAI call per file). 300s gives ~75
// files headroom at 4-second average analysis time, with concurrency=4.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const source = (body.source || "").toString();
    const target = (body.path || body.url || "").toString().trim();
    if (!target) {
      return NextResponse.json({ error: "path or url is required" }, { status: 400 });
    }

    const opts = {
      extractSymbols: body.extractSymbols !== false,
      useAI: body.useAI === true,
      maxFiles: typeof body.maxFiles === "number" ? body.maxFiles : undefined,
      extraTags: Array.isArray(body.tags) ? body.tags : undefined,
    };

    resetImporterCache();
    let summary: ImportSummary;
    if (source === "github" || /^https?:\/\/(www\.)?github\.com\//i.test(target) || /^github\.com\//i.test(target)) {
      summary = await importFromGithub(target, opts);
    } else {
      summary = await importFromLocal(target, opts);
    }
    return NextResponse.json({ summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "import failed" },
      { status: 400 },
    );
  }
}
