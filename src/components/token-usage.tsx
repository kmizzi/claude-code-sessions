"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { formatTokens, formatNumber } from "@/lib/utils";
import type { TokenPeriodStats } from "@/lib/types";
import { TrendingUp, ChevronRight } from "lucide-react";

interface Props {
  periods: TokenPeriodStats[] | null;
}

// Claude Opus 4 API pricing (per million tokens)
const PRICING = {
  input: 15,       // $15/M
  output: 75,      // $75/M
  cacheRead: 1.5,  // $1.50/M
  cacheWrite: 18.75, // $18.75/M
};

function estimateCost(p: TokenPeriodStats): number {
  return (
    (p.inputTokens / 1_000_000) * PRICING.input +
    (p.outputTokens / 1_000_000) * PRICING.output +
    (p.cacheReadTokens / 1_000_000) * PRICING.cacheRead +
    (p.cacheCreateTokens / 1_000_000) * PRICING.cacheWrite
  );
}

function formatCost(dollars: number): string {
  if (dollars < 0.01) return "$0.00";
  if (dollars < 1) return `$${dollars.toFixed(2)}`;
  if (dollars < 1000) return `$${dollars.toFixed(2)}`;
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TokenUsage({ periods }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!periods) return null;

  return (
    <Card className="border-border/50 p-5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Token usage</h2>
          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
        </div>
        <span className="text-[11px] text-muted-foreground">
          Cost estimates based on Opus 4 API rates
        </span>
      </button>
      {expanded && <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Period</th>
              <th className="pb-2 pr-4 font-medium text-right">Input</th>
              <th className="pb-2 pr-4 font-medium text-right">Output</th>
              <th className="pb-2 pr-4 font-medium text-right">Cache read</th>
              <th className="pb-2 pr-4 font-medium text-right">Cache write</th>
              <th className="pb-2 pr-4 font-medium text-right">Total</th>
              <th className="pb-2 pr-4 font-medium text-right">Sessions</th>
              <th className="pb-2 font-medium text-right">Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => {
              const total =
                p.inputTokens +
                p.outputTokens +
                p.cacheReadTokens +
                p.cacheCreateTokens;
              const cost = estimateCost(p);
              return (
                <tr
                  key={p.label}
                  className="border-b border-border/30 last:border-0"
                >
                  <td className="py-2.5 pr-4 font-medium text-foreground">
                    {p.label}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-muted-foreground tabular-nums">
                    {formatTokens(p.inputTokens)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-muted-foreground tabular-nums">
                    {formatTokens(p.outputTokens)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-muted-foreground tabular-nums">
                    {formatTokens(p.cacheReadTokens)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-muted-foreground tabular-nums">
                    {formatTokens(p.cacheCreateTokens)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono font-medium text-foreground tabular-nums">
                    {formatTokens(total)}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-muted-foreground tabular-nums">
                    {formatNumber(p.sessionCount)}
                  </td>
                  <td className="py-2.5 text-right font-mono font-medium text-emerald-400 tabular-nums">
                    {formatCost(cost)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}
    </Card>
  );
}
