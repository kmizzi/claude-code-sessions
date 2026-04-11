"use client";

import { useEffect, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ViewFilters } from "@/lib/types";

interface Props {
  filters: ViewFilters;
  onChange: (next: ViewFilters) => void;
}

interface Option {
  key: keyof ViewFilters;
  label: string;
  hint?: string;
}

const GROUPS: Array<{ title: string; options: Option[] }> = [
  {
    title: "Messages",
    options: [
      { key: "showHuman", label: "Your prompts" },
      { key: "showAssistant", label: "Assistant replies" },
      { key: "showSidechains", label: "Subagent runs" },
    ],
  },
  {
    title: "Claude Code noise",
    options: [
      {
        key: "showCompactSummary",
        label: "Compaction summaries",
        hint: "Auto-generated when the session overflows",
      },
      {
        key: "showTaskNotification",
        label: "Background task notifications",
        hint: "Results from `run_in_background` Bash calls",
      },
      {
        key: "showSlashCommand",
        label: "Slash command invocations",
        hint: "e.g. /login, /compact",
      },
      {
        key: "showCommandOutput",
        label: "Command output / caveats",
        hint: "Local command stdout & system context",
      },
      { key: "showSystem", label: "Raw system messages" },
    ],
  },
  {
    title: "Tool activity",
    options: [
      { key: "showToolUses", label: "Tool calls" },
      { key: "showToolResults", label: "Tool results" },
      { key: "expandTools", label: "Expand tool details", hint: "Show full content inline" },
    ],
  },
  {
    title: "Display",
    options: [{ key: "showTimestamps", label: "Timestamps" }],
  },
];

export function ViewFiltersPopover({ filters, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <div ref={ref} className="relative">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        onClick={() => setOpen((o) => !o)}
      >
        <Eye className="h-3.5 w-3.5" />
        View
        <span className="text-muted-foreground">{activeCount}</span>
      </Button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-md border border-border/60 bg-popover p-3 shadow-lg">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Visible elements
          </div>
          <div className="space-y-3">
            {GROUPS.map((group) => (
              <div key={group.title}>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.title}
                </div>
                <div className="space-y-0.5">
                  {group.options.map((opt) => {
                    const checked = filters[opt.key];
                    return (
                      <label
                        key={opt.key}
                        className={cn(
                          "flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/40",
                          !checked && "text-muted-foreground",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-[hsl(var(--brand))]"
                          checked={checked}
                          onChange={(e) =>
                            onChange({ ...filters, [opt.key]: e.target.checked })
                          }
                        />
                        <span className="flex-1 leading-tight">
                          <span>{opt.label}</span>
                          {opt.hint && (
                            <span className="block text-[10px] text-muted-foreground">
                              {opt.hint}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-border/50 pt-2 text-[10px] text-muted-foreground">
            Export matches what you see.
          </div>
        </div>
      )}
    </div>
  );
}
