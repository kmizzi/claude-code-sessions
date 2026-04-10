"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { StatsHeader } from "@/components/stats-header";
import { SearchBar, type SearchMode } from "@/components/search-bar";
import { SessionListTable } from "@/components/session-list/table";
import {
  SessionListFilters,
  type SessionFilters,
} from "@/components/session-list/filters";
import type {
  AppStats,
  IndexStatus,
  ProjectRow,
  SessionRow,
} from "@/lib/types";
import { Progress } from "@/components/ui/progress";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const EMPTY_FILTERS: SessionFilters = {
  model: null,
  hasBranch: false,
  hasSubagents: false,
};

export default function HomePage() {
  const pathname = usePathname();
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [stats, setStats] = useState<AppStats | null>(null);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [filters, setFilters] = useState<SessionFilters>(EMPTY_FILTERS);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("keyword");
  const [refreshTick, setRefreshTick] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Reset focused index when the user changes query/filters/project (not on SSE refresh)
  useEffect(() => {
    setFocusedIndex(-1);
  }, [query, mode, activeProjectId, filters]);

  // Keyboard navigation: j/k to move, enter to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, sessions.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && focusedIndex >= 0) {
        e.preventDefault();
        const s = sessions[focusedIndex];
        if (s) router.push(`/sessions/${s.id}`);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sessions, focusedIndex, router]);

  // Available models (derived from session list so filter Select stays consistent)
  const models = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) if (s.primaryModel) set.add(s.primaryModel);
    return Array.from(set).sort();
  }, [sessions]);

  const fetchSideData = useCallback(async () => {
    try {
      const [pRes, sRes, iRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/stats"),
        fetch("/api/index/status"),
      ]);
      const pJson = await pRes.json();
      const sJson = await sRes.json();
      const iJson = await iRes.json();
      setProjects(pJson.projects ?? []);
      setStats(sJson.stats ?? null);
      setIndexStatus(iJson.status ?? null);
    } catch {
      // noop — the SSE /api/events channel will catch us up
    }
  }, []);

  // Load sessions (list or search) whenever inputs change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const run = async () => {
      try {
        if (query.trim()) {
          const url = new URL("/api/search", window.location.origin);
          url.searchParams.set("q", query.trim());
          url.searchParams.set("mode", mode);
          url.searchParams.set("limit", "100");
          const res = await fetch(url);
          const json = await res.json();
          if (cancelled) return;
          // /api/search returns SessionRow[] directly (not wrapped in SearchHit)
          const results: SessionRow[] = json.results ?? [];
          setSessions(results);
        } else {
          const url = new URL("/api/sessions", window.location.origin);
          if (activeProjectId != null)
            url.searchParams.set("projectId", String(activeProjectId));
          if (filters.model) url.searchParams.set("model", filters.model);
          if (filters.hasBranch) url.searchParams.set("hasBranch", "true");
          if (filters.hasSubagents) url.searchParams.set("hasSubagents", "true");
          url.searchParams.set("limit", "500");
          const res = await fetch(url);
          const json = await res.json();
          if (cancelled) return;
          setSessions(json.sessions ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // debounce search queries slightly
    const delay = query.trim() ? 180 : 0;
    const handle = setTimeout(run, delay);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, mode, activeProjectId, filters, refreshTick]);

  // Initial + periodic refresh of the side data
  useEffect(() => {
    fetchSideData();
  }, [fetchSideData]);

  // Listen to SSE for backfill progress + live updates
  const reloadRef = useRef(fetchSideData);
  reloadRef.current = fetchSideData;
  useEffect(() => {
    const es = new EventSource("/api/events");
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        reloadRef.current();
        setRefreshTick((t) => t + 1);
      }, 1500);
    };

    let lastSessionCount = -1;
    es.addEventListener("status", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as IndexStatus;
        setIndexStatus(data);
        if (lastSessionCount !== -1 && data.sessionsTotal !== lastSessionCount) {
          scheduleRefresh();
        }
        lastSessionCount = data.sessionsTotal;
      } catch {}
    });
    es.onerror = () => {
      // the browser auto-reconnects; no-op
    };
    return () => {
      es.close();
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, []);

  const backfillRunning =
    indexStatus?.running && indexStatus.phase === "backfill";
  const backfillPct =
    indexStatus && indexStatus.filesTotal > 0
      ? Math.round((indexStatus.filesIndexed / indexStatus.filesTotal) * 100)
      : 0;

  const handleReindex = async () => {
    await fetch("/api/index/reindex", { method: "POST" });
    fetchSideData();
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <Sidebar
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={setActiveProjectId}
        pathname={pathname}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-col gap-4 border-b border-border/50 bg-background/95 px-6 py-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {activeProjectId == null
                  ? "All sessions"
                  : projects.find((p) => p.id === activeProjectId)?.displayName ??
                    "Sessions"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {indexStatus
                  ? `${indexStatus.sessionsTotal.toLocaleString()} sessions indexed`
                  : "Indexing…"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReindex}
              className="gap-1.5 text-xs text-muted-foreground"
              disabled={backfillRunning}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${backfillRunning ? "animate-spin" : ""}`}
              />
              Re-index
            </Button>
          </div>

          <StatsHeader stats={stats} />

          <SearchBar
            value={query}
            onChange={setQuery}
            mode={mode}
            onModeChange={setMode}
            count={sessions.length}
            embeddingsReady={indexStatus?.embeddings.phase === "ready"}
          />

          <div className="flex items-center justify-between gap-3">
            <SessionListFilters
              filters={filters}
              onChange={setFilters}
              models={models}
            />
            {backfillRunning && (
              <div className="flex min-w-[220px] items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                <div className="flex-1">
                  <Progress value={backfillPct} className="h-1" />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {indexStatus?.filesIndexed}/{indexStatus?.filesTotal}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <SessionListTable
            sessions={sessions}
            loading={loading}
            focusedIndex={focusedIndex}
            emptyMessage={
              query.trim()
                ? `No sessions matched "${query.trim()}".`
                : "No sessions yet — start a Claude Code conversation and it will appear here."
            }
          />
        </div>
      </main>
    </div>
  );
}
