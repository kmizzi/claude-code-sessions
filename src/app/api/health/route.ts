import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return NextResponse.json({
    app: "claude-code-sessions",
    version: process.env.npm_package_version ?? "0.0.0",
    ok: true,
    time: Date.now(),
  });
}
