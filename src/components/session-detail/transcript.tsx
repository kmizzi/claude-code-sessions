"use client";

import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { JsonlLine, ViewFilters } from "@/lib/types";
import { MessageBubble } from "./message-bubble";
import { Loader2 } from "lucide-react";

export interface FindState {
  query: string;
  matches: { lineIdx: number; occurrenceInLine: number }[];
  /** 0-based index into `matches`; -1 if there are no matches. */
  current: number;
}

interface Props {
  visible: JsonlLine[];
  loading: boolean;
  error: string | null;
  filters: ViewFilters;
  findState?: FindState;
}

export function Transcript({ visible, loading, error, filters, findState }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140,
    overscan: 8,
  });

  // When the active find match changes, scroll its row into view (the
  // virtualizer mounts it), then nudge the highlighted <mark> to center.
  // Two-step because the row may not be in the DOM until the virtualizer
  // re-renders post-scrollToIndex.
  useEffect(() => {
    if (!findState) return;
    const { matches, current } = findState;
    if (current < 0 || current >= matches.length) return;
    const match = matches[current];
    virtualizer.scrollToIndex(match.lineIdx, { align: "center" });
    const t = setTimeout(() => {
      const el = parentRef.current?.querySelector('[data-find-current="true"]');
      if (el && "scrollIntoView" in el) {
        (el as HTMLElement).scrollIntoView({ block: "center", behavior: "auto" });
      }
    }, 60);
    return () => clearTimeout(t);
  }, [findState, virtualizer]);

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

  if (visible.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        (nothing to display — adjust View filters)
      </div>
    );
  }

  // Map lineIdx → "current occurrence within line", so each bubble knows
  // which of its matches (if any) is the active one. Also record which
  // lineIdx values have matches at all so non-current matches get the dim
  // highlight color.
  const currentMatch =
    findState && findState.current >= 0 ? findState.matches[findState.current] : null;
  const query = findState?.query ?? "";

  return (
    <div ref={parentRef} className="h-full overflow-auto scrollbar-thin">
      <div
        className="mx-auto w-full max-w-3xl px-6"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const line = visible[virtualItem.index];
          const isCurrentLine = currentMatch?.lineIdx === virtualItem.index;
          return (
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
              <MessageBubble
                line={line}
                filters={filters}
                highlight={
                  query
                    ? {
                        query,
                        currentOccurrenceInLine: isCurrentLine
                          ? currentMatch!.occurrenceInLine
                          : null,
                      }
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
