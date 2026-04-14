"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Search, Sparkles, Hash } from "lucide-react";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type SearchMode = "keyword" | "semantic";

interface Props {
  value: string;
  onChange: (v: string) => void;
  mode: SearchMode;
  onModeChange: (m: SearchMode) => void;
  placeholder?: string;
  count?: number | null;
  embeddingsReady?: boolean;
}

export function SearchBar({
  value,
  onChange,
  mode,
  onModeChange,
  placeholder,
  count,
  embeddingsReady = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the search bar on mount so users can start typing immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ⌘K focuses the search bar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="relative">
      <div
        className={cn(
          "pointer-events-none absolute -inset-px rounded-2xl opacity-60 blur-md transition",
          "bg-gradient-to-r from-[hsl(var(--brand)/0.35)] via-[hsl(var(--brand)/0.15)] to-[hsl(var(--brand)/0.35)]",
        )}
        aria-hidden
      />
      <div className="relative flex items-center gap-3 rounded-2xl border-2 border-[hsl(var(--brand)/0.45)] bg-card/90 px-3 py-2.5 shadow-lg shadow-[hsl(var(--brand)/0.15)] ring-1 ring-[hsl(var(--brand)/0.2)] transition focus-within:border-[hsl(var(--brand))] focus-within:shadow-[hsl(var(--brand)/0.3)] focus-within:ring-2 focus-within:ring-[hsl(var(--brand)/0.45)]">
        <Search className="ml-1 h-5 w-5 shrink-0 text-[hsl(var(--brand))]" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") inputRef.current?.blur();
          }}
          placeholder={
            placeholder ??
            (mode === "semantic"
              ? "Describe the session you're looking for…"
              : "Search sessions, prompts, branches…")
          }
          className="h-11 min-w-0 flex-1 bg-transparent text-base font-medium text-foreground placeholder:text-foreground/50 focus:outline-none"
        />
        {count != null && (
          <Badge variant="muted" className="h-7 shrink-0 font-mono text-xs">
            {count.toLocaleString()}
          </Badge>
        )}
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && onModeChange(v as SearchMode)}
          variant="outline"
          size="sm"
          className="shrink-0 rounded-lg border border-border/60 bg-background/40 p-0.5"
        >
          <ToggleGroupItem
            value="keyword"
            className="h-8 gap-1.5 border-0 px-3 text-xs"
            title="Match exact words in session gists, prompts, branches, and paths"
          >
            <Hash className="h-3.5 w-3.5" />
            Keyword
          </ToggleGroupItem>
          <ToggleGroupItem
            value="semantic"
            className="h-8 gap-1.5 border-0 px-3 text-xs"
            disabled={!embeddingsReady}
            title={
              embeddingsReady
                ? "Find sessions by meaning — matches similar concepts even without exact words"
                : "Enable AI search in Settings first"
            }
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI
          </ToggleGroupItem>
        </ToggleGroup>
        <kbd className="pointer-events-none mr-1 hidden h-7 items-center gap-1 rounded border border-border/60 bg-muted px-2 font-mono text-[11px] text-muted-foreground sm:inline-flex">
          ⌘K
        </kbd>
      </div>
      {value.trim() && (
        <span className="absolute -bottom-5 left-2 text-[10px] text-muted-foreground">
          {mode === "keyword"
            ? "Matching exact words. Try AI mode for natural-language queries."
            : "Finding sessions by meaning. For questions & analysis, use the AI chat."}
        </span>
      )}
    </div>
  );
}
