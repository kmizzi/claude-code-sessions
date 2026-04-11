"use client";

import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { JsonlLine, ViewFilters } from "@/lib/types";
import { MessageBubble } from "./message-bubble";
import { Loader2 } from "lucide-react";

interface Props {
  lines: JsonlLine[];
  loading: boolean;
  error: string | null;
  filters: ViewFilters;
}

export function Transcript({ lines, loading, error, filters }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Per-line top-level visibility. Whether a bubble has any renderable blocks
  // after filtering is checked inside MessageBubble — if it renders null we
  // still reserve a virtualizer slot (cheap) since the filter is coarse here.
  const visible = useMemo(() => {
    return lines.filter((l) => {
      if (l.isSidechain && !filters.showSidechains) return false;
      const role = l.message?.role ?? l.type;
      if (role === "user" && !filters.showUser && !filters.showToolResults) return false;
      if (role === "assistant" && !filters.showAssistant && !filters.showToolUses) return false;
      if (role === "system" && !filters.showSystem) return false;
      return (
        (l.type === "user" || l.type === "assistant" || l.type === "system") &&
        l.message?.content != null
      );
    });
  }, [lines, filters]);

  const virtualizer = useVirtualizer({
    count: visible.length,
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

  if (visible.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        (nothing to display — adjust View filters)
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
            <MessageBubble line={visible[virtualItem.index]} filters={filters} />
          </div>
        ))}
      </div>
    </div>
  );
}
