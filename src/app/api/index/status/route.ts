import { NextResponse } from "next/server";
import { getIndexStatus } from "@/lib/indexer/runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return NextResponse.json({ status: getIndexStatus() });
}
