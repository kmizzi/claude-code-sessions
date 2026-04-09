"use client";

import { useState } from "react";
import { ChevronRight, Wrench, FileText, Terminal } from "lucide-react";
import { cn, truncate } from "@/lib/utils";

interface ToolUseProps {
  name: string;
  input: unknown;
}

function iconFor(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("bash") || lower.includes("shell")) return Terminal;
  if (lower.includes("read") || lower.includes("write") || lower.includes("edit")) return FileText;
  return Wrench;
}

function firstLineInput(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input;
  if (typeof input !== "object") return String(input);
  const rec = input as Record<string, unknown>;
  const keys = ["command", "file_path", "path", "pattern", "query", "description"];
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return JSON.stringify(input);
}

export function ToolUseBlock({ name, input }: ToolUseProps) {
  const [open, setOpen] = useState(false);
  const Icon = iconFor(name);
  const summary = firstLineInput(input);

  return (
    <div className="my-1.5 overflow-hidden rounded-md border border-border/50 bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40"
      >
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-90")}
        />
        <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="font-mono font-medium text-foreground/90">{name}</span>
        {summary && !open && (
          <span className="truncate font-mono text-muted-foreground">
            {truncate(summary.replace(/\s+/g, " "), 120)}
          </span>
        )}
      </button>
      {open && (
        <pre className="max-h-64 overflow-auto border-t border-border/50 bg-background/40 px-3 py-2 font-mono text-xs leading-snug text-muted-foreground scrollbar-thin">
          {typeof input === "string" ? input : JSON.stringify(input, null, 2)}
        </pre>
      )}
    </div>
  );
}

interface ToolResultProps {
  content: unknown;
  isError?: boolean;
}

export function ToolResultBlock({ content, isError }: ToolResultProps) {
  const [open, setOpen] = useState(false);
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((c) =>
              typeof c === "string"
                ? c
                : typeof (c as Record<string, unknown>)?.text === "string"
                  ? (c as { text: string }).text
                  : "",
            )
            .join("\n")
        : JSON.stringify(content);
  const firstLine = text.split("\n")[0];

  return (
    <div
      className={cn(
        "my-1.5 overflow-hidden rounded-md border bg-muted/20",
        isError ? "border-rose-500/40" : "border-border/50",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40"
      >
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-90")}
        />
        <span
          className={cn(
            "font-mono",
            isError ? "text-rose-400" : "text-muted-foreground",
          )}
        >
          {isError ? "error" : "result"}
        </span>
        {!open && (
          <span className="truncate font-mono text-muted-foreground">
            {truncate(firstLine, 120)}
          </span>
        )}
      </button>
      {open && (
        <pre className="max-h-80 overflow-auto border-t border-border/50 bg-background/40 px-3 py-2 font-mono text-xs leading-snug text-muted-foreground scrollbar-thin whitespace-pre-wrap">
          {text}
        </pre>
      )}
    </div>
  );
}
