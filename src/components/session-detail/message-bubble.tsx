"use client";

import { cn } from "@/lib/utils";
import { ToolUseBlock, ToolResultBlock } from "./tool-block";
import type { JsonlLine } from "@/lib/types";
import { Bot, User, Terminal } from "lucide-react";

interface Props {
  line: JsonlLine;
}

type ContentBlock = {
  type?: string;
  text?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
  is_error?: boolean;
  tool_use_id?: string;
};

function normalizeContent(content: unknown): ContentBlock[] {
  if (!content) return [];
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (Array.isArray(content)) return content as ContentBlock[];
  return [];
}

export function MessageBubble({ line }: Props) {
  const role = line.message?.role ?? (line.type as string);
  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const isSystem = !isUser && !isAssistant;

  const blocks = normalizeContent(line.message?.content);
  if (blocks.length === 0) return null;

  // Skip synthetic tool-result-only user messages? No — render them collapsed under the prior assistant turn.
  // For simplicity, tool_result blocks render inline in the user bubble.

  const hasOnlyToolResults =
    isUser && blocks.every((b) => b?.type === "tool_result");

  const timestamp = line.timestamp
    ? new Date(line.timestamp).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  const Icon = isUser ? User : isAssistant ? Bot : Terminal;
  const roleLabel = isUser
    ? "You"
    : isAssistant
      ? line.message?.model?.replace(/^claude-/, "").replace(/-\d{8}$/, "") ?? "Claude"
      : "System";

  return (
    <div
      className={cn(
        "group relative flex gap-3 py-4",
        hasOnlyToolResults && "opacity-70",
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
          isUser && "border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.1)] text-[hsl(var(--brand))]",
          isAssistant && "border-sky-500/30 bg-sky-500/10 text-sky-400",
          isSystem && "border-border/60 bg-muted/40 text-muted-foreground",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">
            {roleLabel}
          </span>
          {line.isSidechain && (
            <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              sidechain
            </span>
          )}
          <span className="font-mono text-[11px] text-muted-foreground">
            {timestamp}
          </span>
        </div>
        <div className="space-y-1.5 text-[15px] leading-relaxed">
          {blocks.map((block, i) => {
            if (!block || typeof block !== "object") return null;
            if (block.type === "text" && block.text) {
              return (
                <div
                  key={i}
                  className="whitespace-pre-wrap break-words text-foreground/90"
                >
                  {block.text}
                </div>
              );
            }
            if (block.type === "tool_use") {
              return (
                <ToolUseBlock
                  key={i}
                  name={block.name ?? "tool"}
                  input={block.input}
                />
              );
            }
            if (block.type === "tool_result") {
              return (
                <ToolResultBlock
                  key={i}
                  content={block.content}
                  isError={block.is_error}
                />
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}
