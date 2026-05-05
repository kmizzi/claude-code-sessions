"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
      {
        key: "showAssistantFinal",
        label: "Assistant final replies",
        hint: "The terminal reply that closes each of your turns",
      },
      {
        key: "showAssistantIntermediate",
        label: "Assistant intermediate commentary",
        hint: "Text & thinking between tool calls — noisy",
      },
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
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Position the panel relative to the trigger button. We portal the panel to
  // <body> so it can't be clipped by any ancestor's stacking context or
  // overflow — but that means we need to compute its absolute position
  // ourselves. Recompute on resize/scroll while open.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        (triggerRef.current && triggerRef.current.contains(target)) ||
        (panelRef.current && panelRef.current.contains(target))
      ) {
        return;
      }
      setOpen(false);
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

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            style={{ top: pos.top, right: pos.right }}
            className="fixed z-[1000] w-64 select-text rounded-md border border-border/60 bg-popover p-3 text-popover-foreground shadow-lg"
          >
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
                      const id = `vf-${opt.key}`;
                      return (
                        <div
                          key={opt.key}
                          className={cn(
                            "flex items-start gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/40",
                            !checked && "text-muted-foreground",
                          )}
                        >
                          <input
                            id={id}
                            type="checkbox"
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-[hsl(var(--brand))]"
                            checked={checked}
                            onChange={(e) =>
                              onChange({ ...filters, [opt.key]: e.target.checked })
                            }
                          />
                          <div className="flex-1 leading-tight">
                            <label htmlFor={id} className="cursor-pointer">
                              {opt.label}
                            </label>
                            {opt.hint && (
                              <div className="text-[10px] text-muted-foreground">
                                {opt.hint}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 border-t border-border/50 pt-2 text-[10px] text-muted-foreground">
              Export matches what you see.
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={triggerRef} className="relative">
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
      {panel}
    </div>
  );
}
