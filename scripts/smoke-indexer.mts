// Smoke test: index all Claude Code session files and verify the DB
import { runBackfill } from "../src/lib/indexer/backfill";
import { getDb } from "../src/lib/db/client";
import {
  countSessions,
  listSessions,
  getAppStats,
  listProjects,
} from "../src/lib/db/queries";

getDb();
console.log("DB open. Running backfill...");
const start = Date.now();
await runBackfill((p) => {
  if (p.done % 500 === 0 || p.phase !== "indexing") {
    process.stdout.write(
      `  [${p.phase}] ${p.done}/${p.total} (${p.throughputPerSec.toFixed(1)}/s)\n`,
    );
  }
});
console.log("Backfill done in", ((Date.now() - start) / 1000).toFixed(1), "s");
console.log("Total sessions indexed:", countSessions());

const stats = getAppStats();
console.log("Stats:", JSON.stringify(stats, null, 2));

console.log("Projects (first 5):");
for (const p of listProjects().slice(0, 5)) {
  console.log("  -", p.displayName, "|", p.sessionCount, "sessions");
}

console.log("Sample sessions:");
const samples = listSessions({ limit: 5 });
for (const s of samples) {
  console.log(
    "  -",
    s.id.slice(0, 8),
    "|",
    s.projectName,
    "|",
    s.primaryModel ?? "?",
    "| ctx=" + (s.contextPct?.toFixed(0) ?? "?") + "% |",
    (s.gist ?? "").slice(0, 50),
  );
}
