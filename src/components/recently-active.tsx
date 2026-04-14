"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, Copy, ExternalLink, Radio } from "lucide-react";
import type { SessionRow } from "@/lib/types";
import { relativeTime } from "@/lib/time";
import { iTerm2RestoreScript } from "@/lib/restore-commands";

interface ClusterDto {
  closedAt: number;
  sessions: SessionRow[];
}

interface LiveDto {
  alive: SessionRow[];
  clusters: ClusterDto[];
}

interface Props {
  refreshSignal: number;
}

const POLL_MS = 5_000;

export function RecentlyActive({ refreshSignal }: Props) {
  const [data, setData] = useState<LiveDto>({ alive: [], clusters: [] });
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/live-sessions")
        .then((r) => r.json())
        .then((j: LiveDto) => {
          if (!cancelled) setData({ alive: j.alive ?? [], clusters: j.clusters ?? [] });
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshSignal]);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {}
  };

  // One alive entry per cwd — an idle pane in the same project doesn't need a
  // second row (the mapping heuristic would have matched both anyway).
  const aliveDeduped = useMemo(() => dedupeByCwd(data.alive), [data.alive]);

  if (aliveDeduped.length === 0 && data.clusters.length === 0) return null;

  return (
    <div className="space-y-3">
      {aliveDeduped.length > 0 && (
        <LiveSection
          sessions={aliveDeduped}
          copied={copied}
          onCopy={copy}
        />
      )}
      {data.clusters.map((c) => (
        <ClusterSection
          key={`cluster-${c.closedAt}`}
          cluster={c}
          copied={copied}
          onCopy={copy}
        />
      ))}
    </div>
  );
}

function dedupeByCwd(sessions: SessionRow[]): SessionRow[] {
  const seen = new Map<string, SessionRow>();
  for (const s of sessions) {
    if (!s.cwd) continue;
    const existing = seen.get(s.cwd);
    if (!existing || (s.lastTs ?? 0) > (existing.lastTs ?? 0)) {
      seen.set(s.cwd, s);
    }
  }
  return Array.from(seen.values()).sort(
    (a, b) => (b.lastTs ?? 0) - (a.lastTs ?? 0),
  );
}

interface SectionProps {
  sessions: SessionRow[];
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}

function LiveSection({ sessions, copied, onCopy }: SectionProps) {
  const scriptKey = "__live__";
  const restoreScript = iTerm2RestoreScript(
    sessions
      .filter((s): s is SessionRow & { cwd: string } => s.cwd != null)
      .map((s) => ({ cwd: s.cwd, id: s.id })),
  );
  return (
    <Card className="border-emerald-500/30 bg-emerald-500/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <Radio className="h-4 w-4 text-emerald-500" />
          <h2 className="text-sm font-semibold">Live sessions</h2>
          <span className="text-[11px] text-muted-foreground">
            {sessions.length} open in terminal
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={() => onCopy(restoreScript, scriptKey)}
          title="Paste into a shell to reopen every live session in one split iTerm2 window"
        >
          {copied === scriptKey ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied === scriptKey ? "Copied" : "Copy iTerm2 restore script"}
        </Button>
      </div>
      <SessionList sessions={sessions} copied={copied} onCopy={onCopy} />
    </Card>
  );
}

function ClusterSection({
  cluster,
  copied,
  onCopy,
}: {
  cluster: ClusterDto;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const scriptKey = `cluster-${cluster.closedAt}`;
  const restoreScript = iTerm2RestoreScript(
    cluster.sessions
      .filter((s): s is SessionRow & { cwd: string } => s.cwd != null)
      .map((s) => ({ cwd: s.cwd, id: s.id })),
  );
  return (
    <Card className="border-amber-500/30 bg-amber-500/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold">
            Closed together {relativeTime(cluster.closedAt)}
          </h2>
          <span className="text-[11px] text-muted-foreground">
            {cluster.sessions.length} sessions · likely iTerm window or app close
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={() => onCopy(restoreScript, scriptKey)}
          title="Paste into a shell to reopen every session that closed in this event"
        >
          {copied === scriptKey ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied === scriptKey ? "Copied" : "Copy iTerm2 restore script"}
        </Button>
      </div>
      <SessionList sessions={cluster.sessions} copied={copied} onCopy={onCopy} />
    </Card>
  );
}

function SessionList({ sessions, copied, onCopy }: SectionProps) {
  return (
    <div className="space-y-1.5">
      {sessions.map((s) => (
        <div
          key={s.id}
          className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2 text-sm"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{s.projectName}</span>
              <span className="text-[10px] text-muted-foreground">
                {relativeTime(s.lastTs)}
              </span>
            </div>
            {s.gist && (
              <div className="truncate text-xs text-muted-foreground">{s.gist}</div>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
            onClick={() => onCopy(s.id, s.id)}
            title={`Copy session ID: ${s.id}`}
          >
            {copied === s.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied === s.id ? "Copied" : "Copy session ID"}
          </Button>
          <Link
            href={`/sessions/${s.id}`}
            className="text-muted-foreground hover:text-foreground"
            title="Open session detail"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      ))}
    </div>
  );
}
