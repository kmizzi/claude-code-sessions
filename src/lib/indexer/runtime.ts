import type { BackfillProgress } from "@/lib/indexer/backfill";
import { runBackfill } from "@/lib/indexer/backfill";
import { SessionsWatcher } from "@/lib/indexer/watcher";
import { countIndexedFiles, countSessions, getMeta } from "@/lib/db/queries";
import type { IndexStatus } from "@/lib/types";
import { walkClaudeProjects } from "@/lib/indexer/incremental";

/**
 * Global indexer runtime shared across Next.js server-side modules.
 * Lives on globalThis so hot-reload in dev mode doesn't spawn duplicate watchers.
 */

interface RuntimeState {
  watcher: SessionsWatcher | null;
  backfill: BackfillProgress | null;
  watching: boolean;
  listeners: Set<(status: IndexStatus) => void>;
  embeddingsState: IndexStatus["embeddings"];
  lastError: string | null;
}

const GLOBAL_KEY = "__ccSessionsRuntime__";

function state(): RuntimeState {
  const g = globalThis as unknown as Record<string, RuntimeState | undefined>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      watcher: null,
      backfill: null,
      watching: false,
      listeners: new Set(),
      embeddingsState: {
        modelReady: false,
        embedded: 0,
        total: 0,
        phase: "disabled",
        lastError: null,
      },
      lastError: null,
    };
  }
  return g[GLOBAL_KEY] as RuntimeState;
}

function notify(): void {
  const status = getIndexStatus();
  for (const fn of state().listeners) {
    try {
      fn(status);
    } catch {
      /* ignore listener errors */
    }
  }
}

export function subscribe(fn: (status: IndexStatus) => void): () => void {
  state().listeners.add(fn);
  return () => state().listeners.delete(fn);
}

export function getIndexStatus(): IndexStatus {
  const s = state();
  const total = s.backfill?.total ?? walkClaudeProjects().length;
  return {
    filesTotal: total,
    filesIndexed: countIndexedFiles(),
    sessionsTotal: countSessions(),
    running: s.backfill?.phase === "indexing" || s.backfill?.phase === "discovering",
    phase: s.backfill
      ? s.backfill.phase === "indexing" || s.backfill.phase === "discovering"
        ? "backfill"
        : s.watching
          ? "watching"
          : "idle"
      : s.watching
        ? "watching"
        : "idle",
    lastBackfillAt: Number(getMeta("last_full_backfill_at") ?? "") || null,
    lastError: s.lastError,
    throughputPerSec: s.backfill?.throughputPerSec ?? 0,
    embeddings: s.embeddingsState,
  };
}

/** Start the watcher (idempotent). */
export function startWatcher(): void {
  const s = state();
  if (s.watcher) return;
  s.watcher = new SessionsWatcher();
  s.watcher.start();
  s.watcher.onChange(() => notify());
  s.watching = true;
  notify();
}

export function stopWatcher(): void {
  const s = state();
  if (s.watcher) {
    s.watcher.stop();
    s.watcher = null;
  }
  s.watching = false;
  notify();
}

/** Kick off a backfill pass. If one is running, returns immediately. */
export async function kickBackfill(): Promise<void> {
  const s = state();
  if (s.backfill && (s.backfill.phase === "indexing" || s.backfill.phase === "discovering")) {
    return;
  }
  s.backfill = {
    total: 0,
    done: 0,
    phase: "discovering",
    startedAt: Date.now(),
    throughputPerSec: 0,
    lastError: null,
  };
  notify();
  await runBackfill((p) => {
    s.backfill = p;
    notify();
  });
  notify();
}

/** Update embeddings runtime state from the embeddings worker. */
export function updateEmbeddingsState(patch: Partial<IndexStatus["embeddings"]>): void {
  const s = state();
  s.embeddingsState = { ...s.embeddingsState, ...patch };
  notify();
}
