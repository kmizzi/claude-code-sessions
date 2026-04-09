"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Transcript } from "@/components/session-detail/transcript";
import { MetadataSidebar } from "@/components/session-detail/metadata-sidebar";
import type { SessionRow } from "@/lib/types";
import { truncate } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function SessionDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          <div className="flex shrink-0 gap-2">
            <a href={`/api/sessions/${id}/export?format=summary`} download>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" /> Summary
              </Button>
            </a>
            <a href={`/api/sessions/${id}/export`} download>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" /> Full MD
              </Button>
            </a>
          </div>
        </header>
        <div className="min-h-0 flex-1">
          <Transcript sessionId={id} />
        </div>
      </main>
      <MetadataSidebar session={session} />
    </div>
  );
}
