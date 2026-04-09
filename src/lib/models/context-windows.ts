/**
 * Context window sizes (in tokens) per Claude model.
 * Used to compute the "context %" meter from a session's final usage stats.
 */
export const CONTEXT_WINDOWS: Record<string, number> = {
  "claude-opus-4-6": 200_000,
  "claude-opus-4-5": 200_000,
  "claude-sonnet-4-6": 1_000_000,
  "claude-sonnet-4-5": 1_000_000,
  "claude-sonnet-4": 200_000,
  "claude-haiku-4-5": 200_000,
  "claude-haiku-4": 200_000,
  "claude-3-5-sonnet": 200_000,
  "claude-3-5-haiku": 200_000,
  "claude-3-opus": 200_000,
};

const DEFAULT_WINDOW = 200_000;

export function windowFor(model: string | null | undefined): number {
  if (!model) return DEFAULT_WINDOW;
  if (CONTEXT_WINDOWS[model]) return CONTEXT_WINDOWS[model];
  // Fuzzy match: strip a trailing date suffix (e.g. -20251001)
  const stripped = model.replace(/-\d{8}$/, "");
  if (CONTEXT_WINDOWS[stripped]) return CONTEXT_WINDOWS[stripped];
  // Prefix match
  for (const [k, v] of Object.entries(CONTEXT_WINDOWS)) {
    if (model.startsWith(k)) return v;
  }
  return DEFAULT_WINDOW;
}

/**
 * Compute context % from the final assistant usage object.
 * Only the last message's usage is meaningful — summing across messages
 * over-counts cache_creation_input_tokens.
 */
export function computeContextPct(
  model: string | null | undefined,
  usage: {
    lastInputTokens: number | null;
    lastCacheCreateTokens: number | null;
    lastCacheReadTokens: number | null;
  },
): { pct: number | null; used: number | null; window: number } {
  const window = windowFor(model);
  const parts = [usage.lastInputTokens, usage.lastCacheCreateTokens, usage.lastCacheReadTokens];
  if (parts.every((p) => p == null)) {
    return { pct: null, used: null, window };
  }
  const used =
    (usage.lastInputTokens ?? 0) +
    (usage.lastCacheCreateTokens ?? 0) +
    (usage.lastCacheReadTokens ?? 0);
  // 0 tokens used means usage wasn't captured — show "—" not "0%"
  if (used === 0) return { pct: null, used: null, window };
  const pct = Math.max(0, Math.min(100, (used / window) * 100));
  return { pct, used, window };
}
