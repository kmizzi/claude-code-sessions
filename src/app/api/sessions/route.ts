import { NextResponse, type NextRequest } from "next/server";
import { listSessions } from "@/lib/db/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const model = searchParams.get("model");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const limit = searchParams.get("limit");
  const offset = searchParams.get("offset");
  const hasBranch = searchParams.get("hasBranch");
  const hasSubagents = searchParams.get("hasSubagents");

  const sessions = listSessions({
    projectId: projectId ? Number(projectId) : undefined,
    model: model ?? undefined,
    dateFrom: dateFrom ? Number(dateFrom) : undefined,
    dateTo: dateTo ? Number(dateTo) : undefined,
    limit: limit ? Math.min(500, Number(limit)) : 200,
    offset: offset ? Number(offset) : 0,
    hasGitBranch: hasBranch === "true",
    hasSubagents: hasSubagents === "true",
  });
  return NextResponse.json({ sessions });
}
