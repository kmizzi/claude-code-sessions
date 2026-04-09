import { getSession } from "@/lib/db/queries";
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import type { JsonlLine } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/sessions/[id]/export
 *
 * Returns the session as a Markdown file download.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "full";

  const session = getSession(id);
  if (!session) {
    return new Response("not found", { status: 404 });
  }

  const filePath = await resolveFilePath(id);
  if (!filePath || !existsSync(filePath)) {
    return new Response("file missing", { status: 404 });
  }

  const lines = await readAllLines(filePath);
  const md =
    format === "summary"
      ? buildSummaryMarkdown(session, lines)
      : buildMarkdown(session, lines);
  const suffix = format === "summary" ? "-summary" : "";
  const filename = `session-${id.slice(0, 8)}${suffix}.md`;

  return new Response(md, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

async function resolveFilePath(id: string): Promise<string | null> {
  const { getDb } = await import("@/lib/db/client");
  const db = getDb();
  const row = db
    .prepare<{ id: string }, { file_path: string }>(
      "SELECT file_path FROM sessions WHERE id = @id",
    )
    .get({ id });
  return row?.file_path ?? null;
}

async function readAllLines(path: string): Promise<JsonlLine[]> {
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  const lines: JsonlLine[] = [];
  for await (const raw of rl) {
    if (!raw.trim()) continue;
    try {
      lines.push(JSON.parse(raw) as JsonlLine);
    } catch {
      continue;
    }
  }
  return lines;
}

function extractText(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      if (rec.type === "text" && typeof rec.text === "string") {
        parts.push(rec.text);
      } else if (rec.type === "tool_use") {
        const name = (rec.name as string) ?? "tool";
        const input =
          typeof rec.input === "string"
            ? rec.input
            : JSON.stringify(rec.input, null, 2);
        parts.push(`**Tool: ${name}**\n\`\`\`\n${input}\n\`\`\``);
      } else if (rec.type === "tool_result") {
        const text = extractText(rec.content);
        if (text) {
          const label = rec.is_error ? "Error" : "Result";
          parts.push(
            `**${label}:**\n\`\`\`\n${text.slice(0, 2000)}${text.length > 2000 ? "\n…(truncated)" : ""}\n\`\`\``,
          );
        }
      }
    }
    return parts.join("\n\n");
  }
  return "";
}

interface SessionMeta {
  id: string;
  projectName: string;
  gitBranch: string | null;
  primaryModel: string | null;
  firstTs: number | null;
  lastTs: number | null;
  messageCount: number;
  cwd: string | null;
}

function buildMarkdown(session: SessionMeta, lines: JsonlLine[]): string {
  const parts: string[] = [];

  // Header
  parts.push(`# Session: ${session.id}\n`);
  parts.push(`| Field | Value |`);
  parts.push(`|-------|-------|`);
  parts.push(`| Project | ${session.projectName} |`);
  if (session.cwd) parts.push(`| Directory | \`${session.cwd}\` |`);
  if (session.gitBranch) parts.push(`| Branch | \`${session.gitBranch}\` |`);
  if (session.primaryModel) parts.push(`| Model | ${session.primaryModel} |`);
  if (session.firstTs)
    parts.push(`| Started | ${new Date(session.firstTs).toISOString()} |`);
  if (session.lastTs)
    parts.push(`| Last activity | ${new Date(session.lastTs).toISOString()} |`);
  parts.push(`| Messages | ${session.messageCount} |`);
  parts.push("");
  parts.push("---\n");

  // Messages
  for (const line of lines) {
    const role = line.message?.role ?? (line.type as string);
    if (role !== "user" && role !== "assistant") continue;
    if (!line.message?.content) continue;

    const text = extractText(line.message.content);
    if (!text.trim()) continue;

    const ts = line.timestamp
      ? new Date(line.timestamp).toLocaleString()
      : "";
    const label = role === "user" ? "You" : "Claude";
    const sidechain = line.isSidechain ? " _(sidechain)_" : "";

    parts.push(`### ${label}${sidechain}`);
    if (ts) parts.push(`_${ts}_\n`);
    parts.push(text);
    parts.push("");
  }

  return parts.join("\n");
}

/**
 * Summary export: only user prompts + the final assistant text response
 * before each subsequent user message (the "conclusion" of each turn).
 */
function buildSummaryMarkdown(session: SessionMeta, lines: JsonlLine[]): string {
  const parts: string[] = [];

  // Same header as full export
  parts.push(`# Session Summary: ${session.id}\n`);
  parts.push(`| Field | Value |`);
  parts.push(`|-------|-------|`);
  parts.push(`| Project | ${session.projectName} |`);
  if (session.cwd) parts.push(`| Directory | \`${session.cwd}\` |`);
  if (session.gitBranch) parts.push(`| Branch | \`${session.gitBranch}\` |`);
  if (session.primaryModel) parts.push(`| Model | ${session.primaryModel} |`);
  if (session.firstTs)
    parts.push(`| Started | ${new Date(session.firstTs).toISOString()} |`);
  if (session.lastTs)
    parts.push(`| Last activity | ${new Date(session.lastTs).toISOString()} |`);
  parts.push(`| Messages | ${session.messageCount} |`);
  parts.push("");
  parts.push("---\n");

  // Collect only user/assistant text messages (skip sidechains, tool-only messages)
  const msgs: { role: "user" | "assistant"; text: string; ts: string }[] = [];
  for (const line of lines) {
    if (line.isSidechain) continue;
    const role = line.message?.role ?? (line.type as string);
    if (role !== "user" && role !== "assistant") continue;
    if (!line.message?.content) continue;

    // For summary, only extract plain text (no tool blocks)
    const text = extractPlainText(line.message.content);
    if (!text.trim()) continue;

    const ts = line.timestamp
      ? new Date(line.timestamp).toLocaleString()
      : "";
    msgs.push({ role: role as "user" | "assistant", text, ts });
  }

  // For each user message, emit it + the last assistant response before the next user message
  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i];
    if (msg.role === "user") {
      parts.push(`### You`);
      if (msg.ts) parts.push(`_${msg.ts}_\n`);
      parts.push(msg.text);
      parts.push("");

      // Find the last assistant message before the next user message
      let lastAssistant: (typeof msgs)[number] | null = null;
      for (let j = i + 1; j < msgs.length; j++) {
        if (msgs[j].role === "user") break;
        if (msgs[j].role === "assistant") lastAssistant = msgs[j];
      }

      if (lastAssistant) {
        parts.push(`### Claude`);
        if (lastAssistant.ts) parts.push(`_${lastAssistant.ts}_\n`);
        parts.push(lastAssistant.text);
        parts.push("");
      }
    }
  }

  // If the conversation ends with assistant messages after the last user prompt,
  // the loop above already handles it. But if there's no user message at all,
  // just dump whatever we have.
  if (msgs.length > 0 && msgs[0].role === "assistant") {
    // Edge case: session starts with assistant (e.g., system prompt)
    // Already handled in the loop — user messages drive the iteration
  }

  return parts.join("\n");
}

/** Extract only plain text blocks, ignoring tool_use/tool_result */
function extractPlainText(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      if (rec.type === "text" && typeof rec.text === "string") {
        texts.push(rec.text);
      }
    }
    return texts.join("\n\n");
  }
  return "";
}
