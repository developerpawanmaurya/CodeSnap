import { NextResponse } from "next/server";
import { reindexExistingFiles } from "@/lib/importer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const summary = reindexExistingFiles();
    return NextResponse.json({ summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "reindex failed" },
      { status: 500 },
    );
  }
}
