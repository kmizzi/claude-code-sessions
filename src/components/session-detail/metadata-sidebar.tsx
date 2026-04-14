"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn, formatNumber } from "@/lib/utils";
import { formatDate, formatDuration, relativeTime } from "@/lib/time";
import type { SessionRow } from "@/lib/types";
import {
  Check,
  Copy,
  Folder,
  GitBranch,
  Hash,
  MessageSquare,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  session: SessionRow;
}

function modelShort(model: string | null): string {
  if (!model) return "—";
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

// Opus 4 API pricing (per million tokens)
const PRICING = { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 };

function formatSessionCost(s: SessionRow): string {
  const cost =
    (s.inputTokens / 1_000_000) * PRICING.input +
    (s.outputTokens / 1_000_000) * PRICING.output +
    (s.cacheReadTokens / 1_000_000) * PRICING.cacheRead +
    (s.cacheCreateTokens / 1_000_000) * PRICING.cacheWrite;
  if (cost < 0.01) return "$0.00";
  if (cost < 1000) return `$${cost.toFixed(2)}`;
  return `$${cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function contextTone(pct: number | null) {
  if (pct == null) return { fg: "text-muted-foreground", bg: "bg-muted" };
  if (pct >= 90) return { fg: "text-rose-400", bg: "bg-rose-500/80" };
  if (pct >= 75) return { fg: "text-amber-400", bg: "bg-amber-500/80" };
  if (pct >= 50) return { fg: "text-sky-400", bg: "bg-sky-500/80" };
  return { fg: "text-emerald-400", bg: "bg-emerald-500/80" };
}

export function MetadataSidebar({ session: s }: Props) {
  const [copiedId, setCopiedId] = useState(false);

  const copyId = async () => {
    await navigator.clipboard.writeText(s.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
    toast.success("Session ID copied");
  };

  const pct = s.contextPct;
  const tone = contextTone(pct);
  const liveWindow = s.lastTs != null && Date.now() - s.lastTs < 30 * 60_000;

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-border/50 bg-card/30">
      <div className="space-y-3 border-b border-border/50 px-5 py-5">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Session
          </div>
          <button
            type="button"
            onClick={copyId}
            className="group flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-2.5 py-2 text-left transition hover:border-[hsl(var(--brand)/0.5)] hover:bg-muted/60"
            title="Click to copy — paste into your own resume alias"
          >
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/90">
              {s.id}
            </code>
            {copiedId ? (
              <>
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span className="text-[10px] font-medium text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground">
                  Copy ID
                </span>
              </>
            )}
          </button>
        </div>

        {s.cwd && (
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              cd into
            </div>
            <div className="truncate text-foreground/90">{s.cwd}</div>
          </div>
        )}
      </div>

      <div className="space-y-4 border-b border-border/50 px-5 py-5">
        <div>
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span>Context</span>
            <span className={cn("font-mono", liveWindow ? "text-emerald-400" : "text-muted-foreground")}>
              {liveWindow ? "live" : "snapshot"}
            </span>
          </div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className={cn("font-mono text-2xl font-semibold tabular-nums", tone.fg)}>
              {pct != null ? `${Math.round(pct)}%` : "—"}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {s.contextTokens != null ? formatNumber(s.contextTokens) : "—"} /{" "}
              {s.contextWindow != null ? formatNumber(s.contextWindow) : "—"}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
            <div
              className={cn("h-full rounded-full transition-all", tone.bg)}
              style={{ width: `${Math.min(100, pct ?? 0)}%` }}
            />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
            <div>
              <div className="font-mono text-foreground/90">
                {formatNumber(s.lastInputTokens)}
              </div>
              <div>input</div>
            </div>
            <div>
              <div className="font-mono text-foreground/90">
                {formatNumber(s.lastCacheCreateTokens)}
              </div>
              <div>cache-new</div>
            </div>
            <div>
              <div className="font-mono text-foreground/90">
                {formatNumber(s.lastCacheReadTokens)}
              </div>
              <div>cache-read</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-auto px-5 py-5 scrollbar-thin">
        <MetaRow
          icon={Folder}
          label="Project"
          value={s.projectName}
          subtitle={s.projectPath}
        />
        {s.gitBranch && (
          <MetaRow icon={GitBranch} label="Branch" value={s.gitBranch} mono />
        )}
        <MetaRow
          icon={Hash}
          label="Model"
          value={modelShort(s.primaryModel)}
          mono
        />
        <MetaRow
          icon={MessageSquare}
          label="Messages"
          value={formatNumber(s.messageCount)}
          subtitle={`${formatNumber(s.userMessageCount)} from you`}
        />
        <Separator />
        <MetaRow
          icon={Terminal}
          label="First seen"
          value={s.firstTs ? formatDate(s.firstTs) : "—"}
          subtitle={s.firstTs ? relativeTime(s.firstTs) : undefined}
        />
        <MetaRow
          icon={Terminal}
          label="Last activity"
          value={s.lastTs ? formatDate(s.lastTs) : "—"}
          subtitle={s.lastTs ? relativeTime(s.lastTs) : undefined}
        />
        <MetaRow
          icon={Terminal}
          label="Duration"
          value={formatDuration(s.lastTs && s.firstTs ? s.lastTs - s.firstTs : null)}
        />
        <Separator />
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Total tokens (lifetime)
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <TokenStat label="Input" value={s.inputTokens} />
            <TokenStat label="Output" value={s.outputTokens} />
            <TokenStat label="Cache write" value={s.cacheCreateTokens} />
            <TokenStat label="Cache read" value={s.cacheReadTokens} />
          </div>
          <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Est. API cost
            </div>
            <div className="font-mono text-lg font-semibold text-emerald-400">
              {formatSessionCost(s)}
            </div>
            <div className="text-[10px] text-muted-foreground">Opus 4 rates</div>
          </div>
        </div>
        {s.hasSubagents && (
          <Badge variant="muted" className="w-full justify-center">
            Has subagents
          </Badge>
        )}
      </div>
    </aside>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
  subtitle,
  mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtitle?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className={cn("truncate text-sm text-foreground/90", mono && "font-mono")}>
          {value}
        </div>
        {subtitle && (
          <div className="truncate text-[11px] text-muted-foreground">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

function TokenStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-sm text-foreground/90">
        {formatNumber(value)}
      </div>
    </div>
  );
}
