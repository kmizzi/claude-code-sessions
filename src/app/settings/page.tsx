"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { IndexStatus, ProjectRow } from "@/lib/types";
import { relativeTime } from "@/lib/time";
import { formatNumber } from "@/lib/utils";
import {
  Database,
  RefreshCw,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play,
} from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const pathname = usePathname();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [embeddingsStarting, setEmbeddingsStarting] = useState(false);

  const loadSide = useCallback(async () => {
    const [pRes, iRes] = await Promise.all([
      fetch("/api/projects"),
      fetch("/api/index/status"),
    ]);
    const pJson = await pRes.json();
    const iJson = await iRes.json();
    setProjects(pJson.projects ?? []);
    setIndexStatus(iJson.status ?? null);
  }, []);

  useEffect(() => {
    loadSide();
  }, [loadSide]);

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.addEventListener("status", (e) => {
      try {
        setIndexStatus(JSON.parse((e as MessageEvent).data) as IndexStatus);
      } catch {}
    });
    return () => es.close();
  }, []);

  const reindex = async () => {
    setReindexing(true);
    try {
      await fetch("/api/index/reindex", { method: "POST" });
      toast.success("Re-index started");
    } finally {
      setReindexing(false);
    }
  };

  const enableEmbeddings = async () => {
    setEmbeddingsStarting(true);
    try {
      const res = await fetch("/api/embeddings/init", { method: "POST" });
      const json = await res.json();
      if (json.ok) toast.success("Embeddings initializing");
      else toast.error(json.error ?? "Failed to start embeddings");
    } finally {
      setEmbeddingsStarting(false);
    }
  };

  const backfillRunning =
    indexStatus?.running && indexStatus.phase === "backfill";
  const backfillPct =
    indexStatus && indexStatus.filesTotal > 0
      ? Math.round((indexStatus.filesIndexed / indexStatus.filesTotal) * 100)
      : 0;

  const emb = indexStatus?.embeddings;
  const embPct = emb && emb.total > 0 ? Math.round((emb.embedded / emb.total) * 100) : 0;

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <Sidebar
        projects={projects}
        activeProjectId={null}
        onSelectProject={() => {}}
        pathname={pathname}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-auto scrollbar-thin">
        <div className="border-b border-border/50 bg-background/95 px-6 py-5 backdrop-blur">
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Index, embeddings, and background service.
          </p>
        </div>

        <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-6">
          {/* ── Index status ─────────────────────────────────────── */}
          <Card className="border-border/50 p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[hsl(var(--brand)/0.15)] text-[hsl(var(--brand))]">
                <Database className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">Index</h2>
                <p className="text-xs text-muted-foreground">
                  Claude Code's JSONL sessions parsed into SQLite for fast search.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={reindex}
                disabled={backfillRunning || reindexing}
                className="gap-1.5"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${backfillRunning || reindexing ? "animate-spin" : ""}`}
                />
                Re-index
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <Stat
                label="Sessions indexed"
                value={
                  indexStatus ? formatNumber(indexStatus.sessionsTotal) : "—"
                }
              />
              <Stat
                label="Files"
                value={
                  indexStatus
                    ? `${formatNumber(indexStatus.filesIndexed)} / ${formatNumber(indexStatus.filesTotal)}`
                    : "—"
                }
              />
              <Stat
                label="Phase"
                value={
                  indexStatus ? (
                    <PhaseBadge phase={indexStatus.phase} running={indexStatus.running} />
                  ) : (
                    "—"
                  )
                }
              />
              <Stat
                label="Last backfill"
                value={
                  indexStatus?.lastBackfillAt
                    ? relativeTime(indexStatus.lastBackfillAt)
                    : "never"
                }
              />
            </div>

            {backfillRunning && (
              <div className="mt-4 space-y-1.5">
                <Progress value={backfillPct} className="h-1.5" />
                <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
                  <span>{backfillPct}% indexed</span>
                  <span>
                    {indexStatus?.throughputPerSec.toFixed(1)} files/s
                  </span>
                </div>
              </div>
            )}

            {indexStatus?.lastError && (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="font-mono">{indexStatus.lastError}</span>
              </div>
            )}
          </Card>

          {/* ── Embeddings / AI search ───────────────────────────── */}
          <Card className="border-border/50 p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-500/15 text-amber-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">AI search</h2>
                <p className="text-xs text-muted-foreground">
                  Local embeddings via Xenova MiniLM-L6-v2 (~25 MB). Runs on-device.
                </p>
              </div>
              {emb?.phase === "disabled" && (
                <Button
                  variant="brand"
                  size="sm"
                  onClick={enableEmbeddings}
                  disabled={embeddingsStarting}
                  className="gap-1.5"
                >
                  {embeddingsStarting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Enable
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <Stat
                label="Phase"
                value={
                  emb ? <EmbeddingPhaseBadge phase={emb.phase} /> : "—"
                }
              />
              <Stat
                label="Model"
                value={
                  <span className="font-mono text-xs text-foreground/90">
                    MiniLM-L6-v2
                  </span>
                }
              />
              <Stat
                label="Embedded"
                value={emb ? `${formatNumber(emb.embedded)} / ${formatNumber(emb.total)}` : "—"}
              />
              <Stat
                label="Dimensions"
                value={
                  <span className="font-mono text-xs text-foreground/90">
                    384
                  </span>
                }
              />
            </div>

            {emb?.phase === "embedding" && (
              <div className="mt-4 space-y-1.5">
                <Progress value={embPct} className="h-1.5" />
                <div className="text-right font-mono text-[11px] text-muted-foreground">
                  {embPct}% embedded
                </div>
              </div>
            )}

            {emb?.lastError && (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="font-mono">{emb.lastError}</span>
              </div>
            )}
          </Card>

          {/* ── Service ──────────────────────────────────────────── */}
          <Card className="border-border/50 p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sky-500/15 text-sky-400">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">Background service</h2>
                <p className="text-xs text-muted-foreground">
                  Install as a launchd LaunchAgent so the UI is always running.
                </p>
              </div>
            </div>
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 font-mono text-xs text-muted-foreground">
              <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Run from your terminal
              </div>
              <div>$ claude-code-sessions install-service</div>
              <Separator className="my-2" />
              <div>$ claude-code-sessions uninstall-service</div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Installing writes{" "}
              <code className="rounded bg-muted/50 px-1">
                ~/Library/LaunchAgents/com.claude-code-sessions.plist
              </code>{" "}
              and bootstraps it with <code className="rounded bg-muted/50 px-1">launchctl</code>.
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-foreground/90">{value}</div>
    </div>
  );
}

function PhaseBadge({
  phase,
  running,
}: {
  phase: IndexStatus["phase"];
  running: boolean;
}) {
  if (phase === "error") {
    return <Badge variant="muted" className="border-rose-500/40 bg-rose-500/10 text-rose-300">error</Badge>;
  }
  if (running && phase === "backfill") {
    return (
      <Badge variant="muted" className="gap-1">
        <Loader2 className="h-2.5 w-2.5 animate-spin" /> backfilling
      </Badge>
    );
  }
  if (phase === "watching") {
    return <Badge variant="brand">watching</Badge>;
  }
  return <Badge variant="muted">{phase}</Badge>;
}

function EmbeddingPhaseBadge({
  phase,
}: {
  phase: IndexStatus["embeddings"]["phase"];
}) {
  switch (phase) {
    case "disabled":
      return <Badge variant="muted">disabled</Badge>;
    case "downloading":
      return (
        <Badge variant="muted" className="gap-1">
          <Loader2 className="h-2.5 w-2.5 animate-spin" /> downloading
        </Badge>
      );
    case "embedding":
      return (
        <Badge variant="muted" className="gap-1">
          <Loader2 className="h-2.5 w-2.5 animate-spin" /> embedding
        </Badge>
      );
    case "ready":
      return <Badge variant="brand">ready</Badge>;
    case "error":
      return (
        <Badge variant="muted" className="border-rose-500/40 bg-rose-500/10 text-rose-300">
          error
        </Badge>
      );
  }
}
