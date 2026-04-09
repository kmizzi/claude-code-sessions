"use client";

import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SessionListRow } from "./row";
import type { SessionRow } from "@/lib/types";
import { Loader2 } from "lucide-react";

interface Props {
  sessions: SessionRow[];
  loading?: boolean;
  emptyMessage?: string;
  focusedIndex?: number;
}

export function SessionListTable({
  sessions,
  loading,
  emptyMessage,
  focusedIndex = -1,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: sessions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 10,
  });

  // Scroll the focused row into view
  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < sessions.length) {
      virtualizer.scrollToIndex(focusedIndex, { align: "auto" });
    }
  }, [focusedIndex, sessions.length, virtualizer]);

  if (loading && sessions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading sessions…
      </div>
    );
  }

  if (!loading && sessions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground">
        {emptyMessage ?? "No sessions match the current filters."}
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto scrollbar-thin">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const session = sessions[virtualItem.index];
          return (
            <div
              key={session.id}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <SessionListRow
                session={session}
                focused={virtualItem.index === focusedIndex}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
