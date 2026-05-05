import { NextRequest, NextResponse } from "next/server";
import { aiRetitleAll } from "@/lib/importer";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const onlyFiles = body.onlyFiles !== false; // default true
    const summary = await aiRetitleAll({ onlyFiles });
    return NextResponse.json({ summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "retitle failed" },
      { status: 500 },
    );
  }
}
