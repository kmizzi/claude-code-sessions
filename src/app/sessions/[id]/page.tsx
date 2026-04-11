"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Transcript } from "@/components/session-detail/transcript";
import { MetadataSidebar } from "@/components/session-detail/metadata-sidebar";
import { ViewFiltersPopover } from "@/components/session-detail/view-filters-popover";
import {
  DEFAULT_VIEW_FILTERS,
  type JsonlLine,
  type SessionRow,
  type ViewFilters,
} from "@/lib/types";
import { truncate } from "@/lib/utils";
import { buildSessionMarkdown, downloadMarkdown } from "@/lib/export/markdown";

interface PageProps {
  params: Promise<{ id: string }>;
}

const FILTERS_STORAGE_KEY = "session-view-filters";

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
        <div className="min-h-0 flex-1">
          <Transcript
            lines={lines}
            loading={linesLoading}
            error={linesError}
            filters={filters}
          />
        </div>
      </main>
      <MetadataSidebar session={session} />
    </div>
  );
}
