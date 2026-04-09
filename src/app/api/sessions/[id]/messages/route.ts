import { getSession } from "@/lib/db/queries";
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Streams the JSONL file as a JSON array — each line becomes one element.
 * This lets the browser start rendering messages before the whole file has
 * been parsed, which matters for 99MB sessions.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const session = getSession(id);
  if (!session) {
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  const filePath = (session as unknown as { filePath?: string }).filePath;
  // getSession doesn't expose file_path — re-query the raw row
  const actualPath = await resolveFilePath(id);
  if (!actualPath || !existsSync(actualPath)) {
    return new Response(JSON.stringify({ error: "file missing" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const rl = createInterface({
        input: createReadStream(actualPath, { encoding: "utf8" }),
        crlfDelay: Infinity,
      });
      let first = true;
      controller.enqueue(encoder.encode("["));
      for await (const raw of rl) {
        if (!raw.trim()) continue;
        // Validate JSON so bad lines don't break the client parser
        try {
          JSON.parse(raw);
        } catch {
          continue;
        }
        controller.enqueue(encoder.encode((first ? "" : ",") + raw));
        first = false;
      }
      controller.enqueue(encoder.encode("]"));
      controller.close();
    },
    cancel() {
      /* browser aborted — readline cleanup happens via GC */
    },
  });

  void filePath;
  return new Response(stream, {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

async function resolveFilePath(id: string): Promise<string | null> {
  const { getDb } = await import("@/lib/db/client");
  const db = getDb();
  const row = db
    .prepare<{ id: string }, { file_path: string }>(
      "SELECT file_path FROM sessions WHERE id = @id",
    )
    .get({ id });
  return row?.file_path ?? null;
}
