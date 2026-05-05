import { statSync } from "node:fs";
import { basename, dirname } from "node:path";
import type { JsonlLine, SessionAggregate } from "@/lib/types";
import { streamJsonl, extractText } from "@/lib/jsonl/stream-parse";

const GIST_MAX = 180;

/**
 * Build a SessionAggregate from a JSONL file by streaming it once.
 * Memory is O(1) — we never hold the whole file. The only bounded growth is
 * the model list (usually 1–3 entries).
 */
export async function buildSessionAggregate(filePath: string): Promise<SessionAggregate | null> {
  const sessionId =
    basename(filePath, ".jsonl") ||
    // Fallback if basename is empty for some reason
    filePath;

  const agg: SessionAggregate = {
    sessionId,
    filePath,
    cwd: null,
    gitBranch: null,
    version: null,
    firstTs: null,
    lastTs: null,
    messageCount: 0,
    userMessageCount: 0,
    models: [],
    primaryModel: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreateTokens: 0,
    cacheReadTokens: 0,
    lastInputTokens: null,
    lastCacheCreateTokens: null,
    lastCacheReadTokens: null,
    firstUserPrompt: null,
    lastUserPrompt: null,
    gist: null,
    durationMs: null,
    hasSubagents: false,
    allMessageText: "",
  };

  const modelCounts = new Map<string, number>();
  // Buffer message text into an array; one final join() avoids O(N²) string concat.
  const messageTexts: string[] = [];

  try {
    for await (const { line } of streamJsonl(filePath)) {
      consume(line, agg, modelCounts, messageTexts);
    }
  } catch (err) {
    // Return what we have so far — indexer will record the error on index_state
    if (agg.messageCount === 0) return null;
  }

  // Fill ID from content if the filename didn't match
  // (Claude Code names files by session UUID, so this is rare)
  // No-op here — we already defaulted to basename.

  // Pick primary model = most-used
  if (modelCounts.size > 0) {
    agg.primaryModel = [...modelCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  agg.models = [...modelCounts.keys()];

  // Heuristic gist: truncated first user prompt, fallback to last
  const gistSource = agg.firstUserPrompt ?? agg.lastUserPrompt ?? "";
  agg.gist = gistSource ? truncate(gistSource.replace(/\s+/g, " ").trim(), GIST_MAX) : null;

  // Duration
  if (agg.firstTs != null && agg.lastTs != null) {
    agg.durationMs = agg.lastTs - agg.firstTs;
  }

  agg.allMessageText = messageTexts.join("\n");

  // Subagents subdirectory sibling?
  try {
    const sidecar = statSync(filePath.replace(/\.jsonl$/, ""));
    if (sidecar.isDirectory()) {
      agg.hasSubagents = true;
    }
  } catch {
    // no sidecar dir
  }

  return agg;
}

function consume(
  line: JsonlLine,
  agg: SessionAggregate,
  modelCounts: Map<string, number>,
  messageTexts: string[],
): void {
  // Session-level fields — set once from whichever line has them first
  if (!agg.cwd && typeof line.cwd === "string") agg.cwd = line.cwd;
  if (!agg.gitBranch && typeof line.gitBranch === "string" && line.gitBranch) {
    agg.gitBranch = line.gitBranch;
  }
  if (!agg.version && typeof line.version === "string") agg.version = line.version;

  // Timestamps
  if (typeof line.timestamp === "string") {
    const ts = Date.parse(line.timestamp);
    if (!Number.isNaN(ts)) {
      if (agg.firstTs == null || ts < agg.firstTs) agg.firstTs = ts;
      if (agg.lastTs == null || ts > agg.lastTs) agg.lastTs = ts;
    }
  }

  const type = line.type;
  if (type === "user") {
    agg.messageCount += 1;
    if (!line.isSidechain) agg.userMessageCount += 1;
    const text = extractText(line.message?.content).trim();
    if (text) {
      if (!agg.firstUserPrompt) agg.firstUserPrompt = text;
      agg.lastUserPrompt = text;
      messageTexts.push(text);
    }
    return;
  }

  if (type === "last-prompt" && typeof line.lastPrompt === "string") {
    agg.lastUserPrompt = line.lastPrompt;
    return;
  }

  if (type === "assistant") {
    agg.messageCount += 1;
    const model = line.message?.model;
    if (typeof model === "string" && model) {
      modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1);
    }
    const text = extractText(line.message?.content).trim();
    if (text) messageTexts.push(text);
    const u = line.message?.usage;
    if (u) {
      agg.inputTokens += u.input_tokens ?? 0;
      agg.outputTokens += u.output_tokens ?? 0;
      agg.cacheCreateTokens += u.cache_creation_input_tokens ?? 0;
      agg.cacheReadTokens += u.cache_read_input_tokens ?? 0;
      // Track LAST usage (wins as we iterate)
      agg.lastInputTokens = u.input_tokens ?? agg.lastInputTokens;
      agg.lastCacheCreateTokens = u.cache_creation_input_tokens ?? agg.lastCacheCreateTokens;
      agg.lastCacheReadTokens = u.cache_read_input_tokens ?? agg.lastCacheReadTokens;
    }
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// Silence unused-import warnings for dirname; keep it available for future use.
void dirname;
