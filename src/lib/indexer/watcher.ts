import chokidar, { type FSWatcher } from "chokidar";
import { statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "@/lib/db/client";
import { indexFile, walkClaudeProjects } from "@/lib/indexer/incremental";
import { CLAUDE_PROJECTS } from "@/lib/paths";
import { getIndexState } from "@/lib/db/queries";

/**
 * Live filesystem watcher. Debounces per-path so a rapid append burst is
 * collapsed into a single re-index. Runs a periodic reconciliation pass to
 * catch FSEvents drops.
 */
export class SessionsWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private reconcileTimer: NodeJS.Timeout | null = null;
  private onChangeListeners: Set<(filePath: string) => void> = new Set();

  start(): void {
    if (this.watcher) return;
    this.watcher = chokidar.watch(`${CLAUDE_PROJECTS}/*/*.jsonl`, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
      ignored: (path) => path.includes("/tool-results/") || path.includes("/subagents/"),
    });

    this.watcher
      .on("add", (p) => this.enqueue(p))
      .on("change", (p) => this.enqueue(p))
      .on("unlink", (p) => this.handleDelete(p))
      .on("error", (err) => console.warn("[watcher] error:", err));

    // Reconciliation every 5 minutes — FSEvents can drop events under load
    this.reconcileTimer = setInterval(() => this.reconcile(), 5 * 60 * 1000);
  }

  stop(): void {
    if (this.watcher) {
      void this.watcher.close();
      this.watcher = null;
    }
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
  }

  onChange(fn: (filePath: string) => void): () => void {
    this.onChangeListeners.add(fn);
    return () => this.onChangeListeners.delete(fn);
  }

  private enqueue(filePath: string): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      void this.process(filePath);
    }, 500);
    this.debounceTimers.set(filePath, timer);
  }

  private async process(filePath: string): Promise<void> {
    try {
      await indexFile(getDb(), filePath);
      for (const fn of this.onChangeListeners) fn(filePath);
    } catch (err) {
      console.warn(`[watcher] process failed for ${filePath}:`, err);
    }
  }

  private handleDelete(filePath: string): void {
    const db = getDb();
    try {
      db.prepare(
        "UPDATE sessions SET deleted_at = strftime('%s','now') * 1000 WHERE file_path = ?",
      ).run(filePath);
      db.prepare("DELETE FROM index_state WHERE file_path = ?").run(filePath);
    } catch (err) {
      console.warn(`[watcher] delete failed for ${filePath}:`, err);
    }
  }

  /** Sweep the filesystem and re-index any file whose mtime has drifted from index_state. */
  private async reconcile(): Promise<void> {
    const db = getDb();
    try {
      const files = walkClaudeProjects();
      for (const path of files) {
        let stat;
        try {
          stat = statSync(path);
        } catch {
          continue;
        }
        const mtimeMs = Math.floor(stat.mtimeMs);
        const state = getIndexState(path);
        if (!state || state.mtime_ms !== mtimeMs || state.size_bytes !== stat.size) {
          await indexFile(db, path);
          for (const fn of this.onChangeListeners) fn(path);
        }
      }
    } catch (err) {
      console.warn("[watcher] reconcile failed:", err);
    }
  }
}

// Silence unused import — readdirSync/join reserved for future subagent walker
void readdirSync;
void join;
