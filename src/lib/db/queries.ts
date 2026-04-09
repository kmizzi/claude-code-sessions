import type Database from "better-sqlite3";
import { getDb, VEC_DIMENSION } from "@/lib/db/client";
import type {
  SessionAggregate,
  SessionRow,
  ProjectRow,
  AppStats,
} from "@/lib/types";
import { computeContextPct } from "@/lib/models/context-windows";
import { displayNameForPath } from "@/lib/indexer/encode-path";

interface SessionDbRow {
  id: string;
  project_id: number;
  file_path: string;
  cwd: string | null;
  git_branch: string | null;
  first_ts: number | null;
  last_ts: number | null;
  message_count: number;
  user_message_count: number;
  models: string;
  primary_model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_create_tokens: number;
  cache_read_tokens: number;
  last_input_tokens: number | null;
  last_cache_create_tokens: number | null;
  last_cache_read_tokens: number | null;
  first_user_prompt: string | null;
  last_user_prompt: string | null;
  gist: string | null;
  has_subagents: number;
  project_name: string;
  project_path: string;
}

function rowToSession(row: SessionDbRow): SessionRow {
  const ctx = computeContextPct(row.primary_model, {
    lastInputTokens: row.last_input_tokens,
    lastCacheCreateTokens: row.last_cache_create_tokens,
    lastCacheReadTokens: row.last_cache_read_tokens,
  });
  let models: string[] = [];
  try {
    models = JSON.parse(row.models) as string[];
  } catch {
    models = [];
  }
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    projectPath: row.project_path,
    cwd: row.cwd,
    gitBranch: row.git_branch,
    firstTs: row.first_ts,
    lastTs: row.last_ts,
    messageCount: row.message_count,
    userMessageCount: row.user_message_count,
    primaryModel: row.primary_model,
    models,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheCreateTokens: row.cache_create_tokens,
    cacheReadTokens: row.cache_read_tokens,
    lastInputTokens: row.last_input_tokens,
    lastCacheCreateTokens: row.last_cache_create_tokens,
    lastCacheReadTokens: row.last_cache_read_tokens,
    firstUserPrompt: row.first_user_prompt,
    lastUserPrompt: row.last_user_prompt,
    gist: row.gist,
    hasSubagents: row.has_subagents === 1,
    contextPct: ctx.pct,
    contextTokens: ctx.used,
    contextWindow: ctx.window,
  };
}

const SESSION_COLUMNS = `
  s.id, s.project_id, s.file_path, s.cwd, s.git_branch,
  s.first_ts, s.last_ts, s.message_count, s.user_message_count,
  s.models, s.primary_model,
  s.input_tokens, s.output_tokens, s.cache_create_tokens, s.cache_read_tokens,
  s.last_input_tokens, s.last_cache_create_tokens, s.last_cache_read_tokens,
  s.first_user_prompt, s.last_user_prompt, s.gist, s.has_subagents,
  p.display_name AS project_name, p.decoded_path AS project_path
`;

// ---------- Project upsert ----------

export function upsertProject(
  db: Database.Database,
  encodedPath: string,
  decodedPath: string,
): number {
  const existing = db
    .prepare<{ encoded: string }, { id: number }>(
      "SELECT id FROM projects WHERE encoded_path = @encoded",
    )
    .get({ encoded: encodedPath });
  if (existing) return existing.id;
  const stmt = db.prepare<[string, string, string]>(
    "INSERT INTO projects (encoded_path, decoded_path, display_name) VALUES (?, ?, ?)",
  );
  const info = stmt.run(encodedPath, decodedPath, displayNameForPath(decodedPath));
  return Number(info.lastInsertRowid);
}

// ---------- Session upsert ----------

const UPSERT_SESSION_SQL = `
  INSERT INTO sessions (
    id, project_id, file_path, cwd, git_branch, version,
    first_ts, last_ts, message_count, user_message_count,
    models, primary_model,
    input_tokens, output_tokens, cache_create_tokens, cache_read_tokens,
    last_input_tokens, last_cache_create_tokens, last_cache_read_tokens,
    first_user_prompt, last_user_prompt, gist, duration_ms, has_subagents,
    updated_at
  ) VALUES (
    @id, @project_id, @file_path, @cwd, @git_branch, @version,
    @first_ts, @last_ts, @message_count, @user_message_count,
    @models, @primary_model,
    @input_tokens, @output_tokens, @cache_create_tokens, @cache_read_tokens,
    @last_input_tokens, @last_cache_create_tokens, @last_cache_read_tokens,
    @first_user_prompt, @last_user_prompt, @gist, @duration_ms, @has_subagents,
    strftime('%s','now') * 1000
  )
  ON CONFLICT(id) DO UPDATE SET
    project_id = excluded.project_id,
    file_path = excluded.file_path,
    cwd = excluded.cwd,
    git_branch = excluded.git_branch,
    version = excluded.version,
    first_ts = excluded.first_ts,
    last_ts = excluded.last_ts,
    message_count = excluded.message_count,
    user_message_count = excluded.user_message_count,
    models = excluded.models,
    primary_model = excluded.primary_model,
    input_tokens = excluded.input_tokens,
    output_tokens = excluded.output_tokens,
    cache_create_tokens = excluded.cache_create_tokens,
    cache_read_tokens = excluded.cache_read_tokens,
    last_input_tokens = excluded.last_input_tokens,
    last_cache_create_tokens = excluded.last_cache_create_tokens,
    last_cache_read_tokens = excluded.last_cache_read_tokens,
    first_user_prompt = excluded.first_user_prompt,
    last_user_prompt = excluded.last_user_prompt,
    gist = excluded.gist,
    duration_ms = excluded.duration_ms,
    has_subagents = excluded.has_subagents,
    updated_at = excluded.updated_at
`;

const UPSERT_FTS_SQL = `
  INSERT INTO sessions_fts (session_id, gist, first_user_prompt, last_user_prompt, cwd, git_branch)
  VALUES (?, ?, ?, ?, ?, ?)
`;
const DELETE_FTS_SQL = `DELETE FROM sessions_fts WHERE session_id = ?`;

export function upsertSession(
  db: Database.Database,
  agg: SessionAggregate,
  projectId: number,
): void {
  db.prepare(UPSERT_SESSION_SQL).run({
    id: agg.sessionId,
    project_id: projectId,
    file_path: agg.filePath,
    cwd: agg.cwd,
    git_branch: agg.gitBranch,
    version: agg.version,
    first_ts: agg.firstTs,
    last_ts: agg.lastTs,
    message_count: agg.messageCount,
    user_message_count: agg.userMessageCount,
    models: JSON.stringify(agg.models),
    primary_model: agg.primaryModel,
    input_tokens: agg.inputTokens,
    output_tokens: agg.outputTokens,
    cache_create_tokens: agg.cacheCreateTokens,
    cache_read_tokens: agg.cacheReadTokens,
    last_input_tokens: agg.lastInputTokens,
    last_cache_create_tokens: agg.lastCacheCreateTokens,
    last_cache_read_tokens: agg.lastCacheReadTokens,
    first_user_prompt: agg.firstUserPrompt,
    last_user_prompt: agg.lastUserPrompt,
    gist: agg.gist,
    duration_ms: agg.durationMs,
    has_subagents: agg.hasSubagents ? 1 : 0,
  });

  // Rebuild FTS row
  db.prepare(DELETE_FTS_SQL).run(agg.sessionId);
  db.prepare(UPSERT_FTS_SQL).run(
    agg.sessionId,
    agg.gist ?? "",
    agg.firstUserPrompt ?? "",
    agg.lastUserPrompt ?? "",
    agg.cwd ?? "",
    agg.gitBranch ?? "",
  );
}

// ---------- Project session count recompute ----------

export function refreshProjectStats(db: Database.Database, projectId: number): void {
  db.prepare(
    `UPDATE projects SET
       session_count = (SELECT COUNT(*) FROM sessions WHERE project_id = @pid AND deleted_at IS NULL),
       last_active_at = (SELECT MAX(last_ts) FROM sessions WHERE project_id = @pid AND deleted_at IS NULL)
     WHERE id = @pid`,
  ).run({ pid: projectId });
}

// ---------- List + filter sessions ----------

export interface ListSessionOpts {
  projectId?: number;
  dateFrom?: number;
  dateTo?: number;
  model?: string;
  hasGitBranch?: boolean;
  hasSubagents?: boolean;
  limit?: number;
  offset?: number;
}

export function listSessions(opts: ListSessionOpts = {}): SessionRow[] {
  const db = getDb();
  const clauses: string[] = ["s.deleted_at IS NULL"];
  const params: Record<string, unknown> = {};
  if (opts.projectId != null) {
    clauses.push("s.project_id = @projectId");
    params.projectId = opts.projectId;
  }
  if (opts.dateFrom != null) {
    clauses.push("s.last_ts >= @dateFrom");
    params.dateFrom = opts.dateFrom;
  }
  if (opts.dateTo != null) {
    clauses.push("s.last_ts <= @dateTo");
    params.dateTo = opts.dateTo;
  }
  if (opts.model) {
    clauses.push("s.primary_model = @model");
    params.model = opts.model;
  }
  if (opts.hasGitBranch === true) {
    clauses.push("s.git_branch IS NOT NULL AND s.git_branch != ''");
  }
  if (opts.hasSubagents === true) {
    clauses.push("s.has_subagents = 1");
  }
  params.limit = opts.limit ?? 100;
  params.offset = opts.offset ?? 0;

  const sql = `
    SELECT ${SESSION_COLUMNS}
    FROM sessions s
    JOIN projects p ON p.id = s.project_id
    WHERE ${clauses.join(" AND ")}
    ORDER BY s.last_ts DESC
    LIMIT @limit OFFSET @offset
  `;
  const rows = db.prepare<Record<string, unknown>, SessionDbRow>(sql).all(params);
  return rows.map(rowToSession);
}

export function getSession(id: string): SessionRow | null {
  const db = getDb();
  const row = db
    .prepare<{ id: string }, SessionDbRow>(
      `SELECT ${SESSION_COLUMNS}
       FROM sessions s JOIN projects p ON p.id = s.project_id
       WHERE s.id = @id AND s.deleted_at IS NULL`,
    )
    .get({ id });
  return row ? rowToSession(row) : null;
}

// ---------- Projects ----------

export function listProjects(): ProjectRow[] {
  const db = getDb();
  const rows = db
    .prepare<
      [],
      {
        id: number;
        encoded_path: string;
        decoded_path: string;
        display_name: string;
        session_count: number;
        last_active_at: number | null;
      }
    >(
      `SELECT id, encoded_path, decoded_path, display_name, session_count, last_active_at
       FROM projects ORDER BY last_active_at DESC NULLS LAST`,
    )
    .all();
  return rows.map((r) => ({
    id: r.id,
    encodedPath: r.encoded_path,
    decodedPath: r.decoded_path,
    displayName: r.display_name,
    sessionCount: r.session_count,
    lastActiveAt: r.last_active_at,
  }));
}

// ---------- Stats ----------

export function getAppStats(): AppStats {
  const db = getDb();
  const totals = db
    .prepare<
      [],
      {
        total_sessions: number;
        total_input: number;
        total_output: number;
        total_cache_read: number;
        total_cache_create: number;
        earliest_ts: number | null;
      }
    >(
      `SELECT
         COUNT(*) AS total_sessions,
         COALESCE(SUM(input_tokens),0) AS total_input,
         COALESCE(SUM(output_tokens),0) AS total_output,
         COALESCE(SUM(cache_read_tokens),0) AS total_cache_read,
         COALESCE(SUM(cache_create_tokens),0) AS total_cache_create,
         MIN(first_ts) AS earliest_ts
       FROM sessions WHERE deleted_at IS NULL`,
    )
    .get() ?? {
    total_sessions: 0,
    total_input: 0,
    total_output: 0,
    total_cache_read: 0,
    total_cache_create: 0,
    earliest_ts: null,
  };

  const projectCount = db
    .prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM projects")
    .get()?.n ?? 0;

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const active24 = db
    .prepare<{ cutoff: number }, { n: number }>(
      "SELECT COUNT(*) AS n FROM sessions WHERE last_ts >= @cutoff AND deleted_at IS NULL",
    )
    .get({ cutoff })?.n ?? 0;

  const mostActive = db
    .prepare<
      [],
      { display_name: string; n: number }
    >(
      `SELECT p.display_name, COUNT(*) AS n
       FROM sessions s JOIN projects p ON p.id = s.project_id
       WHERE s.deleted_at IS NULL
       GROUP BY p.id
       ORDER BY n DESC LIMIT 1`,
    )
    .get();

  // Approximate avg context % — pick the last usage of each session relative to opus default
  const avgRow = db
    .prepare<[], { avg_used: number | null }>(
      `SELECT AVG(
         COALESCE(last_input_tokens,0) +
         COALESCE(last_cache_create_tokens,0) +
         COALESCE(last_cache_read_tokens,0)
       ) AS avg_used
       FROM sessions WHERE deleted_at IS NULL AND last_input_tokens IS NOT NULL`,
    )
    .get();
  const avgContextPct =
    avgRow?.avg_used != null ? Math.min(100, (avgRow.avg_used / 200_000) * 100) : null;

  return {
    totalSessions: totals.total_sessions,
    totalProjects: projectCount,
    totalInputTokens: totals.total_input,
    totalOutputTokens: totals.total_output,
    totalCacheReadTokens: totals.total_cache_read,
    totalCacheCreateTokens: totals.total_cache_create,
    activeLast24h: active24,
    mostActiveProject: mostActive ? { name: mostActive.display_name, count: mostActive.n } : null,
    avgContextPct,
    earliestSessionTs: totals.earliest_ts ?? null,
  };
}

// ---------- Token usage by time period ----------

export function getTokenUsageByPeriod(): import("@/lib/types").TokenPeriodStats[] {
  const db = getDb();
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const yesterdayMs = startOfYesterday.getTime();

  const startOfMonth = new Date(startOfToday);
  startOfMonth.setDate(1);
  const monthMs = startOfMonth.getTime();

  const past30Ms = now - 30 * 24 * 60 * 60 * 1000;
  const past7Ms = now - 7 * 24 * 60 * 60 * 1000;

  const periods = [
    { label: "Today", from: todayMs, to: now },
    { label: "Yesterday", from: yesterdayMs, to: todayMs },
    { label: "Past 7 days", from: past7Ms, to: now },
    { label: "Month to date", from: monthMs, to: now },
    { label: "Past 30 days", from: past30Ms, to: now },
  ];

  const stmt = db.prepare<
    { from_ts: number; to_ts: number },
    {
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_create_tokens: number;
      session_count: number;
    }
  >(
    `SELECT
       COALESCE(SUM(input_tokens), 0) AS input_tokens,
       COALESCE(SUM(output_tokens), 0) AS output_tokens,
       COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
       COALESCE(SUM(cache_create_tokens), 0) AS cache_create_tokens,
       COUNT(*) AS session_count
     FROM sessions
     WHERE deleted_at IS NULL
       AND last_ts >= @from_ts AND last_ts < @to_ts`,
  );

  return periods.map((p) => {
    const row = stmt.get({ from_ts: p.from, to_ts: p.to }) ?? {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_create_tokens: 0,
      session_count: 0,
    };
    return {
      label: p.label,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheReadTokens: row.cache_read_tokens,
      cacheCreateTokens: row.cache_create_tokens,
      sessionCount: row.session_count,
    };
  });
}

// ---------- Keyword search (FTS5) ----------

export function keywordSearch(query: string, limit = 50): SessionRow[] {
  const db = getDb();
  const cleaned = sanitizeFtsQuery(query);
  if (!cleaned) return [];
  const sql = `
    SELECT ${SESSION_COLUMNS},
      bm25(sessions_fts, 10.0, 5.0, 5.0, 1.0, 1.0) AS rank
    FROM sessions_fts
    JOIN sessions s ON s.id = sessions_fts.session_id
    JOIN projects p ON p.id = s.project_id
    WHERE sessions_fts MATCH @q AND s.deleted_at IS NULL
    ORDER BY rank
    LIMIT @limit
  `;
  const rows = db
    .prepare<{ q: string; limit: number }, SessionDbRow & { rank: number }>(sql)
    .all({ q: cleaned, limit });
  return rows.map(rowToSession);
}

function sanitizeFtsQuery(query: string): string {
  // Keep letters, numbers, spaces, a few operators.
  const cleaned = query.trim().replace(/["'\-\(\)]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  // Wrap each token as a prefix match so partial words still hit (e.g. "auth" -> "auth*")
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((t) => `${t}*`)
    .join(" ");
}

// ---------- Semantic search (sqlite-vec) ----------

export function semanticSearch(embedding: Float32Array, limit = 50): SessionRow[] {
  const db = getDb();
  try {
    const sql = `
      SELECT ${SESSION_COLUMNS}, v.distance
      FROM sessions_vec v
      JOIN sessions s ON s.id = v.session_id
      JOIN projects p ON p.id = s.project_id
      WHERE v.embedding MATCH ? AND k = ?
        AND s.deleted_at IS NULL
      ORDER BY v.distance
      LIMIT ?
    `;
    const rows = db
      .prepare<[Buffer, number, number], SessionDbRow & { distance: number }>(sql)
      .all(Buffer.from(embedding.buffer), limit, limit);
    return rows.map(rowToSession);
  } catch (err) {
    console.warn("[semanticSearch] failed, vec table may be unavailable:", err);
    return [];
  }
}

// ---------- Index state ----------

export interface IndexStateRow {
  file_path: string;
  inode: number | null;
  size_bytes: number | null;
  byte_offset: number;
  tentative_offset: number | null;
  mtime_ms: number | null;
  last_indexed_at: number | null;
  error: string | null;
}

export function getIndexState(filePath: string): IndexStateRow | undefined {
  const db = getDb();
  return db
    .prepare<{ path: string }, IndexStateRow>(
      "SELECT * FROM index_state WHERE file_path = @path",
    )
    .get({ path: filePath });
}

export function upsertIndexState(row: IndexStateRow): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO index_state (file_path, inode, size_bytes, byte_offset, tentative_offset, mtime_ms, last_indexed_at, error)
     VALUES (@file_path, @inode, @size_bytes, @byte_offset, @tentative_offset, @mtime_ms, @last_indexed_at, @error)
     ON CONFLICT(file_path) DO UPDATE SET
       inode = excluded.inode,
       size_bytes = excluded.size_bytes,
       byte_offset = excluded.byte_offset,
       tentative_offset = excluded.tentative_offset,
       mtime_ms = excluded.mtime_ms,
       last_indexed_at = excluded.last_indexed_at,
       error = excluded.error`,
  ).run(row);
}

export function countIndexedFiles(): number {
  return (
    getDb()
      .prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM index_state WHERE error IS NULL")
      .get()?.n ?? 0
  );
}

export function countSessions(): number {
  return (
    getDb()
      .prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM sessions WHERE deleted_at IS NULL")
      .get()?.n ?? 0
  );
}

// ---------- app_meta helpers ----------

export function getMeta(key: string): string | null {
  return (
    getDb()
      .prepare<{ key: string }, { value: string }>("SELECT value FROM app_meta WHERE key = @key")
      .get({ key })?.value ?? null
  );
}
export function setMeta(key: string, value: string): void {
  getDb()
    .prepare<[string, string]>("INSERT OR REPLACE INTO app_meta VALUES (?, ?)")
    .run(key, value);
}

// Silence unused-import warning when VEC_DIMENSION isn't referenced in this file.
void VEC_DIMENSION;
