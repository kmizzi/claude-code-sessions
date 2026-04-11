"use client";

import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { JsonlLine, ViewFilters } from "@/lib/types";
import { classifyAuthor, isAuthorTextVisible } from "@/lib/message-author";
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

  // Per-line top-level visibility. A line is coarse-visible if any of its
  // blocks could render under the current filters — MessageBubble does the
  // precise per-block filtering and may still render null, in which case we
  // leave an empty virtualizer slot (cheap).
  const visible = useMemo(() => {
    return lines.filter((l) => {
      if (l.isSidechain && !filters.showSidechains) return false;
      if (!(l.type === "user" || l.type === "assistant" || l.type === "system")) return false;
      const content = l.message?.content;
      if (content == null) return false;
      const blocks = Array.isArray(content)
        ? content
        : typeof content === "string"
          ? [{ type: "text" } as const]
          : [];
      const author = classifyAuthor(l);
      const textVisible = isAuthorTextVisible(author.kind, filters);
      const hasText = blocks.some((b) => (b as { type?: string })?.type === "text");
      const hasToolUse = blocks.some((b) => (b as { type?: string })?.type === "tool_use");
      const hasToolResult = blocks.some((b) => (b as { type?: string })?.type === "tool_result");
      return (
        (hasText && textVisible) ||
        (hasToolUse && filters.showToolUses) ||
        (hasToolResult && filters.showToolResults)
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
