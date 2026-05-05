import { NextResponse } from "next/server";
import { listAllTags, seedIfEmpty } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  seedIfEmpty();
  return NextResponse.json({ tags: listAllTags() });
}
