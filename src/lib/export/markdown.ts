/**
 * Client-side WYSIWYG markdown export. The same ViewFilters object that hides
 * elements in the transcript also drives which blocks are emitted here, so the
 * downloaded file always matches what the user saw on screen.
 */

import type { JsonlLine, SessionRow, ViewFilters } from "@/lib/types";
import { classifyAuthor, isAuthorTextVisible, type AuthorInfo } from "@/lib/message-author";

interface ContentBlock {
  type?: string;
  text?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
  is_error?: boolean;
}

function normalizeContent(content: unknown): ContentBlock[] {
  if (!content) return [];
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (Array.isArray(content)) return content as ContentBlock[];
  return [];
}

function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === "string") return c;
        if (c && typeof c === "object") {
          const rec = c as Record<string, unknown>;
          if (typeof rec.text === "string") return rec.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return "";
  }
}

function formatInput(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

/**
 * Extract a one-line human-readable summary from a tool_use input — mirrors
 * the logic in components/session-detail/tool-block.tsx so previews in the
 * exported markdown match what's shown on screen.
 */
function toolInputSummary(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input;
  if (typeof input !== "object") return String(input);
  const rec = input as Record<string, unknown>;
  const keys = ["command", "file_path", "path", "pattern", "query", "description"];
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  try {
    return JSON.stringify(input);
  } catch {
    return "";
  }
}

function filterBlocks(
  blocks: ContentBlock[],
  author: AuthorInfo,
  filters: ViewFilters,
): ContentBlock[] {
  const textVisible = isAuthorTextVisible(author.kind, filters);
  return blocks.filter((b) => {
    if (!b || typeof b !== "object") return false;
    if (b.type === "text") return textVisible;
    if (b.type === "tool_use") return filters.showToolUses;
    if (b.type === "tool_result") return filters.showToolResults;
    // Drop everything else (e.g. thinking blocks) so we don't emit empty sections.
    return false;
  });
}

/** Build a markdown document from a session + its raw lines + filters. */
export function buildSessionMarkdown(
  session: SessionRow,
  lines: JsonlLine[],
  filters: ViewFilters,
): string {
  const out: string[] = [];

  out.push(`# ${session.gist || session.firstUserPrompt || "Session"}\n`);
  out.push(`| Field | Value |`);
  out.push(`|-------|-------|`);
  out.push(`| Session ID | \`${session.id}\` |`);
  out.push(`| Project | ${session.projectName} |`);
  if (session.cwd) out.push(`| Directory | \`${session.cwd}\` |`);
  if (session.gitBranch) out.push(`| Branch | \`${session.gitBranch}\` |`);
  if (session.primaryModel) out.push(`| Model | ${session.primaryModel} |`);
  if (session.firstTs) out.push(`| Started | ${new Date(session.firstTs).toISOString()} |`);
  if (session.lastTs) out.push(`| Last activity | ${new Date(session.lastTs).toISOString()} |`);
  out.push(`| Messages | ${session.messageCount} |`);
  out.push("");
  out.push("---\n");

  for (const line of lines) {
    if (line.isSidechain && !filters.showSidechains) continue;
    if (!line.message?.content) continue;

    const author = classifyAuthor(line);
    const keepBlocks = filterBlocks(
      normalizeContent(line.message.content),
      author,
      filters,
    );

    if (keepBlocks.length === 0) continue;

    const label = author.detail ? `${author.label} · ${author.detail}` : author.label;
    const sidechain = line.isSidechain ? " _(sidechain)_" : "";
    const timestamp =
      filters.showTimestamps && line.timestamp
        ? ` · _${new Date(line.timestamp).toLocaleString()}_`
        : "";

    out.push(`#### ${label}${sidechain}${timestamp}`);
    out.push("");

    for (const block of keepBlocks) {
      if (block.type === "text" && block.text) {
        out.push(block.text);
        out.push("");
      } else if (block.type === "tool_use") {
        const name = block.name ?? "tool";
        if (filters.expandTools) {
          out.push(`**Tool: ${name}**`);
          out.push("```");
          out.push(formatInput(block.input));
          out.push("```");
        } else {
          const preview = toolInputSummary(block.input).replace(/\s+/g, " ").slice(0, 120);
          out.push(`_Tool: \`${name}\`${preview ? ` — ${preview}` : ""}_`);
        }
        out.push("");
      } else if (block.type === "tool_result") {
        const text = toolResultText(block.content);
        const heading = block.is_error ? "**Error:**" : "**Result:**";
        if (filters.expandTools) {
          out.push(heading);
          out.push("```");
          out.push(text);
          out.push("```");
        } else {
          const first = text.split("\n")[0]?.slice(0, 120) ?? "";
          out.push(`${heading} _${first}${text.length > first.length ? "…" : ""}_`);
        }
        out.push("");
      }
    }
  }

  return out.join("\n");
}

/** Trigger a client-side download of the rendered markdown. */
export function downloadMarkdown(filename: string, markdown: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
