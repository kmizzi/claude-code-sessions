"use client";

import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { JsonlLine } from "@/lib/types";
import { MessageBubble } from "./message-bubble";
import { Loader2 } from "lucide-react";

interface Props {
  sessionId: string;
}

export function Transcript({ sessionId }: Props) {
  const [lines, setLines] = useState<JsonlLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setLines([]);

    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/messages`);
        if (!res.ok) {
          const { error: err } = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(err ?? `HTTP ${res.status}`);
        }
        const json = (await res.json()) as JsonlLine[];
        if (cancelled) return;
        // Only keep lines that render as a message bubble — filter noise
        const visible = json.filter(
          (l) =>
            (l.type === "user" ||
              l.type === "assistant" ||
              l.type === "system") &&
            l.message?.content != null,
        );
        setLines(visible);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140,
    overscan: 8,
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading transcript…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-rose-400">
        {error}
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        (empty transcript)
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto scrollbar-thin">
      <div
        className="mx-auto w-full max-w-3xl px-6"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <MessageBubble line={lines[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
