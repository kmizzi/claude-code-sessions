"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  /** 1-based current match position. 0 when there are no matches. */
  current: number;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  /**
   * Increments each time the parent re-opens the find bar (e.g. ⌘F pressed
   * while it's already mounted). Triggers a re-focus + re-select of the input
   * so subsequent ⌘F still feels like "open find" rather than a no-op.
   */
  focusTick: number;
}

export function FindBar({
  query,
  onQueryChange,
  current,
  total,
  onNext,
  onPrev,
  onClose,
  focusTick,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusTick]);

  const counter = query.trim() ? `${current}/${total}` : "";

  return (
    <div className="absolute right-6 top-3 z-30 flex items-center gap-1.5 rounded-md border border-border/60 bg-popover/95 p-1.5 shadow-lg backdrop-blur">
      <Search className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="Find in transcript"
        className="h-7 w-56 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      <span className="min-w-[44px] text-right font-mono text-[11px] text-muted-foreground">
        {counter}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={onPrev}
        disabled={total === 0}
        title="Previous match (Shift+Enter)"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={onNext}
        disabled={total === 0}
        title="Next match (Enter)"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={onClose}
        title="Close (Esc)"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
