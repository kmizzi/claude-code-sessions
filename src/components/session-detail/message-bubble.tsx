"use client";

import { cn } from "@/lib/utils";
import { ToolUseBlock, ToolResultBlock } from "./tool-block";
import type { JsonlLine, ViewFilters } from "@/lib/types";
import { classifyAuthor, type AuthorKind } from "@/lib/message-author";
import {
  Bot,
  User,
  Terminal,
  TerminalSquare,
  Zap,
  SlashSquare,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

function iconForAuthor(kind: AuthorKind): LucideIcon {
  switch (kind) {
    case "human":
      return User;
    case "assistant":
      return Bot;
    case "compact-summary":
      return ScrollText;
    case "task-notification":
      return Zap;
    case "slash-command":
      return SlashSquare;
    case "command-output":
      return TerminalSquare;
    default:
      return Terminal;
  }
}

const TONE_CLASSES: Record<AuthorKind, string> = {
  human:
    "border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.1)] text-[hsl(var(--brand))]",
  assistant: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  "compact-summary": "border-amber-500/30 bg-amber-500/10 text-amber-400",
  "task-notification": "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  "slash-command": "border-violet-500/30 bg-violet-500/10 text-violet-300",
  "command-output": "border-border/60 bg-muted/40 text-muted-foreground",
  system: "border-border/60 bg-muted/40 text-muted-foreground",
};

interface Props {
  line: JsonlLine;
  filters: ViewFilters;
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

export function MessageBubble({ line, filters }: Props) {
  const author = classifyAuthor(line);
  const role = line.message?.role ?? (line.type as string);
  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const isSystem = !isUser && !isAssistant;

  const allBlocks = normalizeContent(line.message?.content);
  if (allBlocks.length === 0) return null;

  // Apply filters to decide which blocks actually render.
  const blocks = allBlocks.filter((b) => {
    if (!b || typeof b !== "object") return false;
    if (b.type === "text") {
      if (isUser) return filters.showUser;
      if (isAssistant) return filters.showAssistant;
      if (isSystem) return filters.showSystem;
      return true;
    }
    if (b.type === "tool_use") return filters.showToolUses;
    if (b.type === "tool_result") return filters.showToolResults;
    return false;
  });

  if (blocks.length === 0) return null;

  const hasOnlyToolResults =
    author.kind === "human" && blocks.every((b) => b?.type === "tool_result");

  const timestamp =
    filters.showTimestamps && line.timestamp
      ? new Date(line.timestamp).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "";

  const Icon = iconForAuthor(author.kind);
  const roleLabel = author.detail ? `${author.label} · ${author.detail}` : author.label;

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
          TONE_CLASSES[author.kind],
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
          {timestamp && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {timestamp}
            </span>
          )}
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
                  defaultOpen={filters.expandTools}
                />
              );
            }
            if (block.type === "tool_result") {
              return (
                <ToolResultBlock
                  key={i}
                  content={block.content}
                  isError={block.is_error}
                  defaultOpen={filters.expandTools}
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
