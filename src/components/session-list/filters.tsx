"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GitBranch, Layers, X } from "lucide-react";

export interface SessionFilters {
  model: string | null;
  hasBranch: boolean;
  hasSubagents: boolean;
}

interface Props {
  filters: SessionFilters;
  onChange: (f: SessionFilters) => void;
  models: string[];
}

const ALL = "__all__";

export function SessionListFilters({ filters, onChange, models }: Props) {
  const active =
    filters.model != null || filters.hasBranch || filters.hasSubagents;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={filters.model ?? ALL}
        onValueChange={(v) =>
          onChange({ ...filters, model: v === ALL ? null : v })
        }
      >
        <SelectTrigger className="h-8 w-[160px] border-border/60 bg-card/50 text-xs">
          <SelectValue placeholder="All models" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All models</SelectItem>
          {models.map((m) => (
            <SelectItem key={m} value={m}>
              {m.replace(/^claude-/, "")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="sm"
        className={cn(
          "h-8 gap-1.5 border-border/60 bg-card/50 text-xs",
          filters.hasBranch && "border-[hsl(var(--brand)/0.5)] bg-[hsl(var(--brand)/0.1)] text-foreground",
        )}
        onClick={() => onChange({ ...filters, hasBranch: !filters.hasBranch })}
      >
        <GitBranch className="h-3 w-3" /> Has branch
      </Button>

      <Button
        variant="outline"
        size="sm"
        className={cn(
          "h-8 gap-1.5 border-border/60 bg-card/50 text-xs",
          filters.hasSubagents && "border-[hsl(var(--brand)/0.5)] bg-[hsl(var(--brand)/0.1)] text-foreground",
        )}
        onClick={() =>
          onChange({ ...filters, hasSubagents: !filters.hasSubagents })
        }
      >
        <Layers className="h-3 w-3" /> Subagents
      </Button>

      {active && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-xs text-muted-foreground"
          onClick={() =>
            onChange({ model: null, hasBranch: false, hasSubagents: false })
          }
        >
          <X className="h-3 w-3" /> Clear
        </Button>
      )}
    </div>
  );
}
