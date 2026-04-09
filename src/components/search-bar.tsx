"use client";

import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Search, Sparkles, Hash } from "lucide-react";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";

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
    <div className="relative flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
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
          className="h-11 rounded-lg border-border/60 bg-card/50 pl-9 pr-24 text-sm focus-visible:ring-[hsl(var(--brand)/0.5)]"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline-flex">
          ⌘K
        </kbd>
      </div>
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(v) => v && onModeChange(v as SearchMode)}
        variant="outline"
        size="sm"
        className="rounded-lg border border-border/60 bg-card/50 p-0.5"
      >
        <ToggleGroupItem
          value="keyword"
          className="gap-1.5 border-0 px-3"
          title="Match exact words in session gists, prompts, branches, and paths"
        >
          <Hash className="h-3.5 w-3.5" />
          Keyword
        </ToggleGroupItem>
        <ToggleGroupItem
          value="semantic"
          className="gap-1.5 border-0 px-3"
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
      {count != null && (
        <Badge variant="muted" className="h-6 font-mono">
          {count}
        </Badge>
      )}
      {value.trim() && (
        <span className="text-[10px] text-muted-foreground absolute -bottom-5 left-0">
          {mode === "keyword"
            ? "Matching exact words. Try AI mode for natural-language queries."
            : "Finding sessions by meaning. For questions & analysis, use the AI chat."}
        </span>
      )}
    </div>
  );
}
