import { NextResponse } from "next/server";
import { listProjects } from "@/lib/db/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return NextResponse.json({ projects: listProjects() });
}
