/**
 * Next.js 15 instrumentation hook — runs once per server boot (including
 * dev-mode hot restarts). We use it to boot the indexer: backfill + watcher.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Dynamic imports so the client bundle stays clean and native modules aren't
  // evaluated in edge runtime.
  const { getDb } = await import("@/lib/db/client");
  const { kickBackfill, startWatcher } = await import("@/lib/indexer/runtime");
  const { countIndexedFiles } = await import("@/lib/db/queries");

  try {
    getDb(); // ensure schema is applied before anything else touches the db
  } catch (err) {
    console.error("[instrumentation] db init failed:", err);
    return;
  }

  // Start watcher immediately so live sessions stream in
  startWatcher();

  // Poll running `claude` processes for liveness (crash-recovery signal).
  const { startLivenessPoller } = await import("@/lib/liveness/poller");
  startLivenessPoller();

  // Kick backfill only if the DB is empty or stale; run async so we don't block boot
  const already = countIndexedFiles();
  if (already === 0) {
    void kickBackfill().catch((err) => {
      console.error("[instrumentation] backfill failed:", err);
    });
  } else {
    // Quiet refresh — reconcile on a timer, but don't block startup
    console.info(`[instrumentation] ${already} files already indexed, skipping full backfill`);
  }
}
