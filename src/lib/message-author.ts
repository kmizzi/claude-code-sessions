/**
 * Figure out who actually authored a JSONL line. Claude Code stores several
 * kinds of auto-generated content as user-role turns (compaction summaries,
 * background task notifications, slash command invocations, local command
 * output), so the raw `role` field alone is misleading. Both the on-screen
 * transcript and the markdown export route through this classifier so the
 * attribution stays consistent between the two views.
 */

import type { JsonlLine, ViewFilters } from "@/lib/types";

export type AuthorKind =
  | "human"
  | "assistant"
  | "system"
  | "compact-summary"
  | "task-notification"
  | "slash-command"
  | "command-output";

export interface AuthorInfo {
  kind: AuthorKind;
  label: string;
  /** Optional secondary label (e.g. the slash command name). */
  detail?: string;
}

/**
 * Whether text blocks from a line with this author kind should render under
 * the current filters. Tool_use / tool_result blocks are gated separately by
 * `showToolUses` / `showToolResults`, not by the author kind.
 */
export function isAuthorTextVisible(
  kind: AuthorKind,
  filters: ViewFilters,
): boolean {
  switch (kind) {
    case "human":
      return filters.showHuman;
    case "assistant":
      return filters.showAssistant;
    case "system":
      return filters.showSystem;
    case "compact-summary":
      return filters.showCompactSummary;
    case "task-notification":
      return filters.showTaskNotification;
    case "slash-command":
      return filters.showSlashCommand;
    case "command-output":
      return filters.showCommandOutput;
  }
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as { type?: string; text?: string };
    if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
  }
  return parts.join("\n");
}

export function classifyAuthor(line: JsonlLine): AuthorInfo {
  const role = line.message?.role ?? line.type;

  if (role === "assistant") {
    const model = line.message?.model;
    const label = model
      ? model.replace(/^claude-/, "").replace(/-\d{8}$/, "")
      : "Claude";
    return { kind: "assistant", label };
  }

  if (role === "system") {
    return { kind: "system", label: "System" };
  }

  // role === "user" from here on.
  if (line.isCompactSummary) {
    return { kind: "compact-summary", label: "Compaction summary" };
  }

  const text = extractText(line.message?.content).trimStart();

  if (text.startsWith("<task-notification>")) {
    return { kind: "task-notification", label: "Background task" };
  }

  if (
    text.startsWith("<local-command-stdout>") ||
    text.startsWith("<local-command-stderr>")
  ) {
    return { kind: "command-output", label: "Command output" };
  }

  if (text.startsWith("<local-command-caveat>")) {
    return { kind: "command-output", label: "Command caveat" };
  }

  // Slash-command invocations look like:
  //   <command-name>/foo</command-name><command-message>foo</command-message>...
  // Sometimes the order is swapped, so match either tag.
  const nameMatch = text.match(/<command-name>([^<]+)<\/command-name>/);
  if (nameMatch || text.startsWith("<command-message>")) {
    return {
      kind: "slash-command",
      label: "Slash command",
      detail: nameMatch?.[1]?.trim(),
    };
  }

  // isMeta is Claude Code's own flag for system-injected user turns that
  // didn't match any of the more specific shapes above.
  if (line.isMeta) {
    return { kind: "command-output", label: "System context" };
  }

  return { kind: "human", label: "You" };
}
