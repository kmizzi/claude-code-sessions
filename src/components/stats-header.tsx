"use client";

import { Card } from "@/components/ui/card";
import { formatNumber, formatTokens } from "@/lib/utils";
import type { AppStats } from "@/lib/types";
import { Activity, Folder, MessageSquare, Sparkles } from "lucide-react";

interface Props {
  stats: AppStats | null;
}

export function StatsHeader({ stats }: Props) {
  const items = [
    {
      label: "Sessions",
      value: stats ? formatNumber(stats.totalSessions) : "—",
      icon: MessageSquare,
      accent: "text-[hsl(var(--brand))]",
    },
    {
      label: "Projects",
      value: stats ? formatNumber(stats.totalProjects) : "—",
      icon: Folder,
      accent: "text-sky-400",
    },
    {
      label: "Active (24h)",
      value: stats ? formatNumber(stats.activeLast24h) : "—",
      icon: Activity,
      accent: "text-emerald-400",
    },
    {
      label: "Total tokens",
      value: stats
        ? formatTokens(
            stats.totalInputTokens +
              stats.totalOutputTokens +
              stats.totalCacheReadTokens,
          )
        : "—",
      sub: stats?.earliestSessionTs
        ? `since ${new Date(stats.earliestSessionTs).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
        : undefined,
      icon: Sparkles,
      accent: "text-amber-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card
            key={item.label}
            className="relative overflow-hidden border-border/50 p-4 transition-colors hover:border-border"
          >
            <div className="flex items-center gap-3">
              <div className={`rounded-md bg-muted/60 p-2 ${item.accent}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </div>
                <div className="font-mono text-lg font-semibold tabular-nums">
                  {item.value}
                </div>
                {"sub" in item && item.sub && (
                  <div className="text-[11px] text-muted-foreground">{item.sub}</div>
                )}
              </div>
            </div>
            <div
              className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-[0.06] blur-2xl ${item.accent.replace("text", "bg")}`}
            />
          </Card>
        );
      })}
    </div>
  );
}
