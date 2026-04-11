/**
 * Liveness poller — periodically lists running `claude` processes, maps each
 * PID to the session JSONL it's writing to, and records liveness in the db.
 *
 * Why this exists: a purely time-based "recently active" view can't tell a
 * session the user intentionally exited from one that was still open in an
 * iTerm pane when the app crashed. Process-level liveness is the only honest
 * signal for "this pane was still alive" regardless of how old the session is.
 *
 * Mapping strategy: `lsof` reliably gives us each claude PID's cwd but NOT the
 * session JSONL (claude appends per-line, not holding the fd open). So we list
 * `~/.claude/projects/<encoded-cwd>/*.jsonl` sorted by mtime DESC and take the
 * top N where N is the number of claude PIDs sharing that cwd. Not perfect if
 * a user has several panes in the same project with some idle, but it handles
 * the common single-pane-per-project case cleanly.
 */

import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_PROJECTS } from "@/lib/paths";
import { encodePathForClaude } from "@/lib/indexer/encode-path";
import { upsertLiveness } from "@/lib/db/queries";

const POLL_INTERVAL_MS = 5_000;

// Resolve binaries by absolute path. launchd daemons run with a minimal PATH
// that omits /usr/sbin, where lsof lives on macOS — spawning by bare name
// would silently fail in production.
const PGREP_BIN = "/usr/bin/pgrep";
const LSOF_BIN = "/usr/sbin/lsof";

let timer: ReturnType<typeof setInterval> | null = null;

export function startLivenessPoller(): void {
  if (timer) return;
  // Run an initial pass immediately so the first dashboard load has data.
  void pollOnce().catch((err) => {
    console.warn("[liveness] initial poll failed:", err);
  });
  timer = setInterval(() => {
    void pollOnce().catch((err) => {
      console.warn("[liveness] poll failed:", err);
    });
  }, POLL_INTERVAL_MS);
  // Allow the process to exit if this is the only thing keeping the loop alive.
  timer.unref?.();
}

export function stopLivenessPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function pollOnce(): Promise<void> {
  const pairs = await listClaudePidsWithCwds();
  if (pairs.length === 0) return;

  // Group PIDs by cwd so we can map N-panes-in-same-project to top-N jsonls.
  const byCwd = new Map<string, number[]>();
  for (const { pid, cwd } of pairs) {
    const list = byCwd.get(cwd) ?? [];
    list.push(pid);
    byCwd.set(cwd, list);
  }

  const now = Date.now();
  for (const [cwd, pids] of byCwd) {
    const sessions = await recentSessionsForCwd(cwd, pids.length);
    for (let i = 0; i < sessions.length; i++) {
      // Pair each session with a PID in a stable order. Imperfect for
      // multi-pane/same-cwd, but good enough for crash-recovery.
      const pid = pids[i] ?? null;
      try {
        upsertLiveness(sessions[i], pid, now);
      } catch {
        // Session may not be indexed yet (brand-new file before backfill
        // catches up). Skip silently — it'll be picked up next poll.
      }
    }
  }
}

interface PidCwd {
  pid: number;
  cwd: string;
}

/** One shot-out to `pgrep -x claude` + batched `lsof`. Returns [] on any error. */
async function listClaudePidsWithCwds(): Promise<PidCwd[]> {
  const pidList = await runCmd(PGREP_BIN, ["-x", "claude"]);
  if (!pidList.trim()) return [];
  const pids = pidList.trim().split(/\s+/).filter(Boolean);
  if (pids.length === 0) return [];

  const lsofOut = await runCmd(LSOF_BIN, ["-a", "-p", pids.join(","), "-d", "cwd"]);
  return parseLsofCwd(lsofOut);
}

/** Parse `lsof -a -p ... -d cwd` output into pid/cwd pairs. */
function parseLsofCwd(output: string): PidCwd[] {
  const out: PidCwd[] = [];
  const lines = output.split("\n");
  for (const line of lines) {
    if (!line || line.startsWith("COMMAND")) continue;
    // Columns: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
    // NAME may contain spaces — take PID from col 2, path from col 9+.
    const parts = line.split(/\s+/);
    if (parts.length < 9) continue;
    const pid = Number(parts[1]);
    if (!Number.isFinite(pid)) continue;
    // The NAME column is the 9th field onward (index 8+).
    const name = parts.slice(8).join(" ");
    if (!name.startsWith("/")) continue;
    out.push({ pid, cwd: name });
  }
  return out;
}

/** Top-n most recently modified *.jsonl files in ~/.claude/projects/<encoded-cwd>/. */
async function recentSessionsForCwd(cwd: string, n: number): Promise<string[]> {
  const encoded = encodePathForClaude(cwd);
  const dir = join(CLAUDE_PROJECTS, encoded);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const jsonls = entries.filter((f) => f.endsWith(".jsonl"));
  if (jsonls.length === 0) return [];

  const withMtime = await Promise.all(
    jsonls.map(async (f) => {
      try {
        const s = await stat(join(dir, f));
        return { id: f.slice(0, -".jsonl".length), mtime: s.mtimeMs };
      } catch {
        return null;
      }
    }),
  );
  const sorted = withMtime
    .filter((x): x is { id: string; mtime: number } => x != null)
    .sort((a, b) => b.mtime - a.mtime);
  return sorted.slice(0, n).map((x) => x.id);
}

function runCmd(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (buf) => {
      out += buf.toString();
    });
    child.on("error", () => resolve(""));
    child.on("close", () => resolve(out));
  });
}
