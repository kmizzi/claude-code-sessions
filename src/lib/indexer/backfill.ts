import { statSync } from "node:fs";
import pLimit from "p-limit";
import { cpus } from "node:os";
import { getDb } from "@/lib/db/client";
import { walkClaudeProjects, indexFile } from "@/lib/indexer/incremental";
import { setMeta } from "@/lib/db/queries";

export interface BackfillProgress {
  total: number;
  done: number;
  phase: "discovering" | "indexing" | "done" | "error";
  startedAt: number;
  throughputPerSec: number;
  lastError: string | null;
}

export type BackfillListener = (p: BackfillProgress) => void;

/**
 * Full backfill pass. Walks ~/.claude/projects/, streams each JSONL, and
 * upserts aggregates. Processes files in mtime-desc order so recent sessions
 * appear first in the UI.
 *
 * better-sqlite3 runs synchronously, so we let indexFile write directly via
 * its prepared statements (WAL mode handles the concurrency). The parse work
 * itself is I/O-bound and parallelized via p-limit.
 */
export async function runBackfill(listener: BackfillListener): Promise<BackfillProgress> {
  const db = getDb();
  const startedAt = Date.now();
  const progress: BackfillProgress = {
    total: 0,
    done: 0,
    phase: "discovering",
    startedAt,
    throughputPerSec: 0,
    lastError: null,
  };
  listener(progress);

  let files: { path: string; mtimeMs: number }[];
  try {
    const paths = walkClaudeProjects();
    files = paths
      .map((p) => {
        try {
          return { path: p, mtimeMs: statSync(p).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((f): f is { path: string; mtimeMs: number } => f != null)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  } catch (err) {
    progress.phase = "error";
    progress.lastError = err instanceof Error ? err.message : String(err);
    listener(progress);
    return progress;
  }

  progress.total = files.length;
  progress.phase = "indexing";
  listener(progress);

  const concurrency = Math.max(2, cpus().length - 2);
  const limit = pLimit(concurrency);

  const tasks = files.map((f) =>
    limit(async () => {
      try {
        await indexFile(db, f.path);
      } catch (err) {
        progress.lastError = err instanceof Error ? err.message : String(err);
      } finally {
        progress.done += 1;
        progress.throughputPerSec =
          progress.done / Math.max(0.001, (Date.now() - startedAt) / 1000);
        if (progress.done % 10 === 0 || progress.done === progress.total) {
          listener(progress);
        }
      }
    }),
  );

  await Promise.all(tasks);

  progress.phase = "done";
  listener(progress);
  setMeta("last_full_backfill_at", String(Date.now()));
  return progress;
}
