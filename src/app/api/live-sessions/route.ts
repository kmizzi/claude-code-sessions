import { NextResponse } from "next/server";
import { getLivenessSince, getSessionsByIds } from "@/lib/db/queries";
import type { SessionRow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Liveness poll interval is 5s; treat anything seen within 15s as alive. */
const ALIVE_WINDOW_MS = 15_000;
/** How far back to look for clustered closes (iTerm window/app kills). */
const CLOSED_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** Deaths within this window of each other are treated as the same "close event". */
const CLUSTER_BUCKET_MS = 2_000;
/** A cluster is "suspect crash/bulk close" only if it contains at least this many sessions. */
const MIN_CLUSTER_SIZE = 2;

interface Cluster {
  closedAt: number;
  sessions: SessionRow[];
}

export async function GET(): Promise<Response> {
  const now = Date.now();
  const since = now - CLOSED_LOOKBACK_MS;
  const rows = getLivenessSince(since);

  const aliveCutoff = now - ALIVE_WINDOW_MS;
  const aliveIds: string[] = [];
  const deadRows: typeof rows = [];
  for (const r of rows) {
    if (r.lastSeenAlive >= aliveCutoff) aliveIds.push(r.sessionId);
    else deadRows.push(r);
  }

  // Bucket dead sessions by last_seen_alive to detect simultaneous closes.
  const buckets = new Map<number, typeof deadRows>();
  for (const r of deadRows) {
    const key = Math.floor(r.lastSeenAlive / CLUSTER_BUCKET_MS);
    const list = buckets.get(key) ?? [];
    list.push(r);
    buckets.set(key, list);
  }

  const clusterRows: Array<{ closedAt: number; ids: string[] }> = [];
  for (const [, list] of buckets) {
    if (list.length < MIN_CLUSTER_SIZE) continue;
    clusterRows.push({
      closedAt: Math.max(...list.map((r) => r.lastSeenAlive)),
      ids: list.map((r) => r.sessionId),
    });
  }
  clusterRows.sort((a, b) => b.closedAt - a.closedAt);

  // Batch-hydrate all referenced sessions in one query.
  const allIds = Array.from(new Set([...aliveIds, ...clusterRows.flatMap((c) => c.ids)]));
  const sessionsById = new Map<string, SessionRow>();
  for (const s of getSessionsByIds(allIds)) sessionsById.set(s.id, s);

  const alive = aliveIds
    .map((id) => sessionsById.get(id))
    .filter((s): s is SessionRow => s != null);

  const clusters: Cluster[] = clusterRows
    .map((c) => ({
      closedAt: c.closedAt,
      sessions: c.ids
        .map((id) => sessionsById.get(id))
        .filter((s): s is SessionRow => s != null),
    }))
    .filter((c) => c.sessions.length >= MIN_CLUSTER_SIZE);

  return NextResponse.json({ alive, clusters });
}
