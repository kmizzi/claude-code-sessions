import { NextResponse } from "next/server";
import { kickBackfill } from "@/lib/indexer/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  // Fire-and-forget — progress is polled via /api/index/status or /api/events
  void kickBackfill().catch((err) => console.error("[reindex] failed:", err));
  return NextResponse.json({ ok: true });
}
