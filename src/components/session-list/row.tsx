"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber, truncate } from "@/lib/utils";
import { relativeTime } from "@/lib/time";
import type { SessionRow } from "@/lib/types";
import { GitBranch, Folder, Layers } from "lucide-react";

interface Props {
  session: SessionRow;
  active?: boolean;
  focused?: boolean;
}

function modelShort(model: string | null): string {
  if (!model) return "—";
  return model
    .replace(/^claude-/, "")
    .replace(/-\d{8}$/, "")
    .replace("-latest", "");
}

function contextTone(pct: number | null): string {
  if (pct == null) return "text-muted-foreground";
  if (pct >= 90) return "text-rose-600";
  if (pct >= 75) return "text-amber-600";
  if (pct >= 50) return "text-sky-600";
  return "text-emerald-600";
}

function contextBar(pct: number | null): string {
  if (pct == null) return "bg-muted";
  if (pct >= 90) return "bg-rose-500";
  if (pct >= 75) return "bg-amber-500";
  if (pct >= 50) return "bg-sky-500";
  return "bg-emerald-500";
}

export function SessionListRow({ session: s, active, focused }: Props) {
  const gist = s.gist || s.firstUserPrompt || "(no prompt)";
  const last = s.lastUserPrompt && s.lastUserPrompt !== s.firstUserPrompt ? s.lastUserPrompt : null;
  const pct = s.contextPct;

  return (
    <Link
      href={`/sessions/${s.id}`}
      className={cn(
        "group block border-b border-border/40 px-5 py-3.5 transition-colors hover:bg-accent/50",
        active && "bg-accent/60",
        focused && "bg-accent",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <Folder className="h-3.5 w-3.5" />
            <span className="max-w-[200px] truncate font-medium text-foreground/80">
              {s.projectName}
            </span>
            {s.gitBranch && (
              <>
                <span className="text-muted-foreground/60">·</span>
                <GitBranch className="h-3.5 w-3.5" />
                <span className="max-w-[140px] truncate font-mono text-xs">{s.gitBranch}</span>
              </>
            )}
            {s.hasSubagents && (
              <>
                <span className="text-muted-foreground/60">·</span>
                <Layers className="h-3.5 w-3.5" />
                <span>subagents</span>
              </>
            )}
            <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
              {relativeTime(s.lastTs)}
            </span>
          </div>
          <div className="truncate text-[15px] font-medium leading-snug text-foreground">
            {truncate(gist, 140)}
          </div>
          {last && (
            <div className="mt-1 truncate text-sm text-muted-foreground">
              <span className="text-muted-foreground/70">↳ </span>
              {truncate(last, 140)}
            </div>
          )}
          <div className="mt-2.5 flex items-center gap-3 text-xs text-muted-foreground">
            <Badge variant="muted" className="font-mono text-xs">
              {modelShort(s.primaryModel)}
            </Badge>
            <span className="font-mono">{formatNumber(s.messageCount)} msgs</span>
            {s.contextTokens != null && (
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted/60">
                  <div
                    className={cn("h-full rounded-full transition-all", contextBar(pct))}
                    style={{ width: `${Math.min(100, pct ?? 0)}%` }}
                  />
                </div>
                <span className={cn("font-mono tabular-nums", contextTone(pct))}>
                  {pct != null ? `${Math.round(pct)}%` : "—"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
