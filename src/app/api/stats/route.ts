import { NextResponse } from "next/server";
import { getAppStats } from "@/lib/db/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return NextResponse.json({ stats: getAppStats() });
}
