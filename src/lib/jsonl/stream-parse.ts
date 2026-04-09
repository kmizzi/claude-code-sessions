import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { JsonlLine } from "@/lib/types";

/**
 * Stream-read a JSONL file line by line. Yields parsed objects.
 * Handles malformed lines by skipping them (returning the raw string in the `_raw` field)
 * to keep indexing resilient to Claude Code schema drift.
 *
 * Supports resuming from a byte offset for incremental reads.
 */
export async function* streamJsonl(
  filePath: string,
  opts?: { startOffset?: number },
): AsyncGenerator<{ line: JsonlLine; raw: string; bytes: number }> {
  const stream = createReadStream(filePath, {
    encoding: "utf8",
    start: opts?.startOffset ?? 0,
  });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let bytesSoFar = opts?.startOffset ?? 0;
  for await (const raw of rl) {
    // +1 for the newline we consumed
    bytesSoFar += Buffer.byteLength(raw, "utf8") + 1;
    if (!raw.trim()) continue;
    let parsed: JsonlLine;
    try {
      parsed = JSON.parse(raw) as JsonlLine;
    } catch {
      // Malformed — surface as a minimal record so aggregator can still move on
      continue;
    }
    yield { line: parsed, raw, bytes: bytesSoFar };
  }
}

/** Extract a plain-text preview from a JSONL message.content, which may be string or array. */
export function extractText(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "string") {
        parts.push(record.text);
      } else if (typeof record.text === "string") {
        parts.push(record.text);
      }
    }
    return parts.join("\n");
  }
  return "";
}
