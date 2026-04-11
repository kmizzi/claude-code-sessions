/**
 * Shape of a single JSONL line in ~/.claude/projects/*.jsonl
 * All fields are optional because the format varies by message type and version.
 */
export interface JsonlLine {
  sessionId?: string;
  type?:
    | "user"
    | "assistant"
    | "system"
    | "attachment"
    | "file-history-snapshot"
    | "permission-mode"
    | "last-prompt"
    | "summary"
    | string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  uuid?: string;
  isSidechain?: boolean;
  /**
   * Set by Claude Code when the line is an auto-generated compaction summary
   * injected as a user turn. The content was written by Claude, not the human,
   * so the UI should label it accordingly.
   */
  isCompactSummary?: boolean;
  /**
   * Set by Claude Code for system-generated content appended into a user turn
   * (e.g. local-command caveats). Used as a fallback classifier when the
   * content shape doesn't match a more specific pattern.
   */
  isMeta?: boolean;
  message?: {
    role?: "user" | "assistant" | "system";
    model?: string;
    content?: unknown;
    /**
     * Claude API stop reason. `tool_use` marks an intermediate assistant turn
     * that's waiting for a tool result; `end_turn` / `stop_sequence` mark
     * terminal replies that close out the user's turn.
     */
    stop_reason?: "end_turn" | "tool_use" | "stop_sequence" | "max_tokens" | string;
    usage?: {
      input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      output_tokens?: number;
    };
  };
  lastPrompt?: string;
  [key: string]: unknown;
}

/**
 * Aggregated facts computed from a whole JSONL file — what goes into the sessions row.
 */
export interface SessionAggregate {
  sessionId: string;
  filePath: string;
  cwd: string | null;
  gitBranch: string | null;
  version: string | null;
  firstTs: number | null;
  lastTs: number | null;
  messageCount: number;
  userMessageCount: number;
  models: string[];
  primaryModel: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  lastInputTokens: number | null;
  lastCacheCreateTokens: number | null;
  lastCacheReadTokens: number | null;
  firstUserPrompt: string | null;
  lastUserPrompt: string | null;
  gist: string | null;
  durationMs: number | null;
  hasSubagents: boolean;
}

/** Row returned to the UI for the session list. */
export interface SessionRow {
  id: string;
  projectId: number;
  projectName: string;
  projectPath: string;
  cwd: string | null;
  gitBranch: string | null;
  firstTs: number | null;
  lastTs: number | null;
  messageCount: number;
  userMessageCount: number;
  primaryModel: string | null;
  models: string[];
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  lastInputTokens: number | null;
  lastCacheCreateTokens: number | null;
  lastCacheReadTokens: number | null;
  firstUserPrompt: string | null;
  lastUserPrompt: string | null;
  gist: string | null;
  hasSubagents: boolean;
  contextPct: number | null;
  contextTokens: number | null;
  contextWindow: number | null;
}

export interface ProjectRow {
  id: number;
  encodedPath: string;
  decodedPath: string;
  displayName: string;
  sessionCount: number;
  lastActiveAt: number | null;
}

export interface AppStats {
  totalSessions: number;
  totalProjects: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreateTokens: number;
  activeLast24h: number;
  mostActiveProject: { name: string; count: number } | null;
  avgContextPct: number | null;
  earliestSessionTs: number | null;
}

export interface TokenPeriodStats {
  label: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  sessionCount: number;
}

export interface IndexStatus {
  filesTotal: number;
  filesIndexed: number;
  sessionsTotal: number;
  running: boolean;
  phase: "idle" | "backfill" | "watching" | "reconcile" | "error";
  lastBackfillAt: number | null;
  lastError: string | null;
  throughputPerSec: number;
  embeddings: {
    modelReady: boolean;
    embedded: number;
    total: number;
    phase: "disabled" | "downloading" | "embedding" | "ready" | "error";
    lastError: string | null;
  };
}

export interface SearchHit {
  session: SessionRow;
  score: number;
  snippet?: string;
}

/**
 * Per-element visibility for the transcript view. The same toggles drive
 * what's rendered on screen and what gets serialized when the user clicks
 * Export — the export is WYSIWYG. Each author kind from `classifyAuthor`
 * has its own toggle so the user can hide noise categories (task
 * notifications, slash commands, command output) without also hiding their
 * actual prompts.
 */
export interface ViewFilters {
  // Author-kind toggles. Line visibility is driven by classifyAuthor(line).
  showHuman: boolean;
  /** Terminal assistant replies (stop_reason !== "tool_use"). */
  showAssistantFinal: boolean;
  /** Intermediate assistant turns (stop_reason === "tool_use") — text/thinking between tool calls. */
  showAssistantIntermediate: boolean;
  showCompactSummary: boolean;
  showTaskNotification: boolean;
  showSlashCommand: boolean;
  showCommandOutput: boolean;
  showSystem: boolean;
  showSidechains: boolean;
  // Tool-block toggles (orthogonal to author kind).
  showToolUses: boolean;
  showToolResults: boolean;
  /** When true, tool use/result blocks render with full content inline instead of collapsed. */
  expandTools: boolean;
  // Display.
  showTimestamps: boolean;
}

export const DEFAULT_VIEW_FILTERS: ViewFilters = {
  showHuman: true,
  showAssistantFinal: true,
  showAssistantIntermediate: true,
  showCompactSummary: true,
  showTaskNotification: false,
  showSlashCommand: false,
  showCommandOutput: false,
  showSystem: false,
  showSidechains: true,
  showToolUses: true,
  showToolResults: true,
  expandTools: false,
  showTimestamps: true,
};

// ---------- Analytics ----------

export interface AnalyticsData {
  /** Usage & cost overview */
  overview: {
    totalCost: number;
    avgDailyTokens: number;
    avgDailyCost: number;
    avgDailySessions: number;
    activeDays: number;
    totalTokens: number;
  };

  /** Token usage by period (same as home page, moved here) */
  tokenPeriods: TokenPeriodStats[];

  /** Session statistics */
  sessionStats: {
    totalSessions: number;
    avgDurationMs: number | null;
    medianDurationMs: number | null;
    longestSession: { id: string; durationMs: number; gist: string | null; projectName: string } | null;
    avgMessagesPerSession: number;
    avgUserMessagesPerSession: number;
    avgTokensPerSession: number;
  };

  /** Activity patterns */
  activity: {
    byDayOfWeek: { day: string; sessions: number; tokens: number }[];
    byHourOfDay: { hour: number; sessions: number; tokens: number }[];
  };

  /** Model distribution */
  modelDistribution: {
    model: string;
    sessions: number;
    totalTokens: number;
    cost: number;
  }[];

  /** Project leaderboard */
  projectLeaderboard: {
    name: string;
    sessions: number;
    totalTokens: number;
    cost: number;
    avgDurationMs: number | null;
  }[];

  /** Cache efficiency */
  cacheEfficiency: {
    totalCacheRead: number;
    totalCacheCreate: number;
    totalInput: number;
    cacheHitRate: number;
    estimatedSavings: number;
  };
}
