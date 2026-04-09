import { NextResponse, type NextRequest } from "next/server";
import { keywordSearch, semanticSearch } from "@/lib/db/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const mode = (searchParams.get("mode") ?? "keyword") as "keyword" | "semantic";
  const limit = Math.min(100, Number(searchParams.get("limit") ?? "50"));

  if (!q) return NextResponse.json({ mode, results: [] });

  if (mode === "keyword") {
    return NextResponse.json({ mode, results: keywordSearch(q, limit) });
  }

  // Semantic: embed the query in-process via the embeddings worker client
  try {
    const { embedQuery } = await import("@/lib/embeddings/worker-client");
    const embedding = await embedQuery(q);
    if (!embedding) {
      return NextResponse.json({
        mode,
        results: [],
        warning: "embedding model not ready",
      });
    }
    return NextResponse.json({ mode, results: semanticSearch(embedding, limit) });
  } catch (err) {
    return NextResponse.json(
      {
        mode,
        results: [],
        warning: err instanceof Error ? err.message : String(err),
      },
      { status: 200 },
    );
  }
}
