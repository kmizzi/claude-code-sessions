"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Transcript, type FindState } from "@/components/session-detail/transcript";
import { MetadataSidebar } from "@/components/session-detail/metadata-sidebar";
import { ViewFiltersPopover } from "@/components/session-detail/view-filters-popover";
import { FindBar } from "@/components/session-detail/find-bar";
import {
  DEFAULT_VIEW_FILTERS,
  type JsonlLine,
  type SessionRow,
  type ViewFilters,
} from "@/lib/types";
import { truncate } from "@/lib/utils";
import { buildSessionMarkdown, downloadMarkdown } from "@/lib/export/markdown";
import {
  computeVisibleLines,
  extractTranscriptText,
} from "@/lib/transcript-visibility";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Bump the storage suffix when the ViewFilters shape changes so old persisted
// state doesn't leak removed keys into the new shape.
const FILTERS_STORAGE_KEY = "session-view-filters:v3";

function loadPersistedFilters(): ViewFilters {
  if (typeof window === "undefined") return DEFAULT_VIEW_FILTERS;
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return DEFAULT_VIEW_FILTERS;
    const parsed = JSON.parse(raw) as Partial<ViewFilters>;
    return { ...DEFAULT_VIEW_FILTERS, ...parsed };
  } catch {
    return DEFAULT_VIEW_FILTERS;
  }
}

export default function SessionDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [lines, setLines] = useState<JsonlLine[]>([]);
  const [linesLoading, setLinesLoading] = useState(true);
  const [linesError, setLinesError] = useState<string | null>(null);

  const [filters, setFilters] = useState<ViewFilters>(DEFAULT_VIEW_FILTERS);
  const [filtersHydrated, setFiltersHydrated] = useState(false);

  // Find-in-transcript state
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findCurrent, setFindCurrent] = useState(0);
  const [findFocusTick, setFindFocusTick] = useState(0);

  // Hydrate filter state from localStorage on first client render.
  useEffect(() => {
    setFilters(loadPersistedFilters());
    setFiltersHydrated(true);
  }, []);

  useEffect(() => {
    if (!filtersHydrated) return;
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // localStorage unavailable — non-fatal
    }
  }, [filters, filtersHydrated]);

  // Fetch session metadata
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${id}`);
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as { session: SessionRow };
        if (!cancelled) setSession(json.session);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Fetch raw JSONL lines — used by both the transcript and the export button.
  useEffect(() => {
    let cancelled = false;
    setLinesLoading(true);
    setLinesError(null);
    setLines([]);

    (async () => {
      try {
        const res = await fetch(`/api/sessions/${id}/messages`);
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as JsonlLine[];
        if (cancelled) return;
        setLines(json);
      } catch (e) {
        if (!cancelled) {
          setLinesError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLinesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleExport = useCallback(() => {
    if (!session) return;
    const md = buildSessionMarkdown(session, lines, filters);
    downloadMarkdown(`session-${id.slice(0, 8)}.md`, md);
  }, [session, lines, filters, id]);

  // Pre-filter lines once for both Transcript and find. Indices into `visible`
  // are the source of truth for find match positions.
  const visible = useMemo(
    () => computeVisibleLines(lines, filters),
    [lines, filters],
  );

  const matches = useMemo(() => {
    const q = findQuery.trim().toLowerCase();
    if (!q || !findOpen) return [] as { lineIdx: number; occurrenceInLine: number }[];
    const out: { lineIdx: number; occurrenceInLine: number }[] = [];
    for (let lineIdx = 0; lineIdx < visible.length; lineIdx++) {
      const text = extractTranscriptText(visible[lineIdx], filters).toLowerCase();
      if (!text) continue;
      let i = 0;
      let occ = 0;
      while ((i = text.indexOf(q, i)) !== -1) {
        out.push({ lineIdx, occurrenceInLine: occ });
        i += q.length;
        occ += 1;
      }
    }
    return out;
  }, [visible, filters, findQuery, findOpen]);

  // Reset to first match whenever the result set changes (new query, filters,
  // or content). Clamp to a valid index if it ran off the end.
  useEffect(() => {
    if (matches.length === 0) {
      setFindCurrent(0);
    } else if (findCurrent >= matches.length) {
      setFindCurrent(0);
    }
  }, [matches.length, findCurrent]);

  // ⌘F / Ctrl+F opens (or re-focuses) the find bar. Override the browser's
  // default find since DOM virtualization makes it useless on long sessions.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
        setFindFocusTick((t) => t + 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const findState: FindState | undefined = findOpen
    ? {
        query: findQuery.trim(),
        matches,
        current: matches.length > 0 ? Math.min(findCurrent, matches.length - 1) : -1,
      }
    : undefined;

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    setFindCurrent((c) => (c + 1) % matches.length);
  }, [matches.length]);
  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    setFindCurrent((c) => (c - 1 + matches.length) % matches.length);
  }, [matches.length]);
  const closeFind = useCallback(() => setFindOpen(false), []);

  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-center text-sm text-rose-400">
        <div>
          <div className="mb-3">{error}</div>
          <Link href="/">
            <Button variant="outline" size="sm">
              Back to sessions
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading session…
      </div>
    );
  }

  const title = session.gist || session.firstUserPrompt || "Untitled session";

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border/50 bg-background/95 px-6 py-4 backdrop-blur">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">
              {truncate(title, 120)}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {session.projectName}
              {session.gitBranch ? ` · ${session.gitBranch}` : ""}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ViewFiltersPopover filters={filters} onChange={setFilters} />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={handleExport}
              disabled={linesLoading || linesError != null}
              title="Download the transcript as markdown — matches the current view"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </div>
        </header>
        <div className="relative min-h-0 flex-1">
          <Transcript
            visible={visible}
            loading={linesLoading}
            error={linesError}
            filters={filters}
            findState={findState}
          />
          {findOpen && (
            <FindBar
              query={findQuery}
              onQueryChange={setFindQuery}
              current={
                matches.length > 0
                  ? Math.min(findCurrent, matches.length - 1) + 1
                  : 0
              }
              total={matches.length}
              onNext={goNext}
              onPrev={goPrev}
              onClose={closeFind}
              focusTick={findFocusTick}
            />
          )}
        </div>
      </main>
      <MetadataSidebar session={session} />
    </div>
  );
}
