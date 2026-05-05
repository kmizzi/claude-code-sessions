import type { JsonlLine, ViewFilters } from "@/lib/types";
import { classifyAuthor, isAuthorTextVisible } from "@/lib/message-author";

/**
 * Filter `lines` down to the rows the transcript actually renders under the
 * current `ViewFilters`. Used by both the virtualized transcript and the
 * in-page find logic so that match indices line up with rendered bubble
 * indices.
 */
export function computeVisibleLines(
  lines: JsonlLine[],
  filters: ViewFilters,
): JsonlLine[] {
  return lines.filter((l) => {
    if (l.isSidechain && !filters.showSidechains) return false;
    if (!(l.type === "user" || l.type === "assistant" || l.type === "system")) return false;
    const content = l.message?.content;
    if (content == null) return false;
    const blocks = Array.isArray(content)
      ? content
      : typeof content === "string"
        ? [{ type: "text" } as const]
        : [];
    const author = classifyAuthor(l);
    const textVisible = isAuthorTextVisible(author.kind, filters);
    const hasText = blocks.some((b) => (b as { type?: string })?.type === "text");
    const hasToolUse = blocks.some((b) => (b as { type?: string })?.type === "tool_use");
    const hasToolResult = blocks.some((b) => (b as { type?: string })?.type === "tool_result");
    return (
      (hasText && textVisible) ||
      (hasToolUse && filters.showToolUses) ||
      (hasToolResult && filters.showToolResults)
    );
  });
}

/**
 * Concatenated text from a line's text blocks — only the blocks whose author
 * kind is currently visible. Used by find-in-transcript to scan each visible
 * row for matches. We intentionally skip tool_use / tool_result blocks: their
 * payload is JSON-y noise and is collapsed by default in the UI.
 */
export function extractTranscriptText(
  line: JsonlLine,
  filters: ViewFilters,
): string {
  const author = classifyAuthor(line);
  if (!isAuthorTextVisible(author.kind, filters)) return "";
  const content = line.message?.content;
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (b): b is { type: string; text?: string } =>
        !!b && typeof b === "object" && (b as { type?: string }).type === "text",
    )
    .map((b) => b.text ?? "")
    .join("\n");
}
