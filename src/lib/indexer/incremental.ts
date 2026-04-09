import { statSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import type Database from "better-sqlite3";
import { buildSessionAggregate } from "@/lib/jsonl/aggregate";
import {
  upsertProject,
  upsertSession,
  upsertIndexState,
  getIndexState,
  refreshProjectStats,
} from "@/lib/db/queries";
import { decodeEncodedPath } from "@/lib/indexer/encode-path";
import { CLAUDE_PROJECTS } from "@/lib/paths";

/**
 * Index a single JSONL file. Handles:
 *  - first-time inserts
 *  - inode-consistent incremental re-reads (re-parses since we denormalize aggregates)
 *  - tentative-offset for in-flight files (mtime within 60s)
 *  - recording the error if parsing fails
 */
export async function indexFile(db: Database.Database, filePath: string): Promise<void> {
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    // File deleted between discovery and parse — ignore
    return;
  }
  if (!stat.isFile()) return;

  const prev = getIndexState(filePath);
  const inodeChanged = prev && prev.inode != null && prev.inode !== stat.ino;
  // For now we re-parse the full file on any change. This is fast because
  // aggregator is O(1) memory and 99MB streams in <1s. Tail-offset becomes
  // important only when we also store per-message rows (out of scope for v1).

  // For in-flight files we still fully parse, but we store a tentative offset
  // so a later reconciliation pass knows the file was mid-write.
  const mtimeMs = Math.floor(stat.mtimeMs);
  const isInFlight = Date.now() - mtimeMs < 60_000;

  try {
    const agg = await buildSessionAggregate(filePath);
    if (!agg) {
      upsertIndexState({
        file_path: filePath,
        inode: stat.ino,
        size_bytes: stat.size,
        byte_offset: stat.size,
        tentative_offset: null,
        mtime_ms: mtimeMs,
        last_indexed_at: Date.now(),
        error: "empty or unparseable",
      });
      return;
    }

    // Resolve project from the CLAUDE_PROJECTS-relative directory
    const encodedFolder = basename(dirnameSafe(filePath));
    // Prefer `cwd` from JSONL as ground truth; fall back to decode heuristic
    const decoded = agg.cwd ?? decodeEncodedPath(encodedFolder);
    const projectId = upsertProject(db, encodedFolder, decoded);

    upsertSession(db, agg, projectId);
    refreshProjectStats(db, projectId);

    upsertIndexState({
      file_path: filePath,
      inode: stat.ino,
      size_bytes: stat.size,
      byte_offset: stat.size,
      tentative_offset: isInFlight ? stat.size : null,
      mtime_ms: mtimeMs,
      last_indexed_at: Date.now(),
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    upsertIndexState({
      file_path: filePath,
      inode: stat.ino,
      size_bytes: stat.size,
      byte_offset: prev?.byte_offset ?? 0,
      tentative_offset: prev?.tentative_offset ?? null,
      mtime_ms: mtimeMs,
      last_indexed_at: Date.now(),
      error: message.slice(0, 500),
    });
  }

  void inodeChanged; // reserved for when we wire tail-offset reads
}

function dirnameSafe(p: string): string {
  // Avoid importing node:path dirname for a one-shot to keep the module lean.
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(0, idx) : p;
}

/** Walk ~/.claude/projects/ and return absolute paths of all top-level .jsonl files. */
export function walkClaudeProjects(): string[] {
  const result: string[] = [];
  let projectDirs: string[];
  try {
    projectDirs = readdirSync(CLAUDE_PROJECTS, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return result;
  }

  for (const proj of projectDirs) {
    const absProj = join(CLAUDE_PROJECTS, proj);
    let entries;
    try {
      entries = readdirSync(absProj, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".jsonl")) {
        result.push(join(absProj, e.name));
      }
    }
  }
  return result;
}
