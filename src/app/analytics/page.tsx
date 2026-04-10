"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatTokens } from "@/lib/utils";
import type { AnalyticsData, ProjectRow } from "@/lib/types";
import {
  DollarSign,
  Clock,
  Zap,
  BarChart3,
  Cpu,
  TrendingUp,
  Activity,
  Folder,
  ArrowRight,
} from "lucide-react";

// Claude Opus 4 API pricing (per million tokens)
const PRICING = {
  input: 15,
  output: 75,
  cacheRead: 1.5,
  cacheWrite: 18.75,
};

function formatCost(dollars: number): string {
  if (dollars < 0.01) return "$0.00";
  if (dollars < 1) return `$${dollars.toFixed(2)}`;
  if (dollars < 1000) return `$${dollars.toFixed(2)}`;
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  if (hours < 24) return `${hours}h ${remainMins}m`;
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  return `${days}d ${remainHours}h`;
}

function estimatePeriodCost(p: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreateTokens: number }): number {
  return (
    (p.inputTokens / 1_000_000) * PRICING.input +
    (p.outputTokens / 1_000_000) * PRICING.output +
    (p.cacheReadTokens / 1_000_000) * PRICING.cacheRead +
    (p.cacheCreateTokens / 1_000_000) * PRICING.cacheWrite
  );
}

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <Card className="relative overflow-hidden border-border/50 p-4 transition-colors hover:border-border">
      <div className="flex items-center gap-3">
        <div className={`rounded-md bg-muted/60 p-2 ${accent}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="font-mono text-lg font-semibold tabular-nums">{value}</div>
          {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
        </div>
      </div>
      <div className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-[0.06] blur-2xl ${accent.replace("text", "bg")}`} />
    </Card>
  );
}

function BarViz({ values, max, color }: { values: number[]; max: number; color: string }) {
  return (
    <div className="flex items-end gap-[3px] h-10">
      {values.map((v, i) => (
        <div
          key={i}
          className={`rounded-sm ${color} min-w-[6px] flex-1 transition-all`}
          style={{ height: max > 0 ? `${Math.max(2, (v / max) * 100)}%` : "2px" }}
          title={String(v)}
        />
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const pathname = usePathname();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/stats/analytics").then((r) => r.json()),
      fetch("/api/projects").then((r) => r.json()),
    ]).then(([aJson, pJson]) => {
      setData(aJson.analytics ?? null);
      setProjects(pJson.projects ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-full bg-background text-foreground">
        <Sidebar projects={projects} activeProjectId={null} onSelectProject={() => {}} pathname={pathname} />
        <main className="flex flex-1 items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading analytics...</div>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-screen w-full bg-background text-foreground">
        <Sidebar projects={projects} activeProjectId={null} onSelectProject={() => {}} pathname={pathname} />
        <main className="flex flex-1 items-center justify-center">
          <div className="text-sm text-muted-foreground">No analytics data available.</div>
        </main>
      </div>
    );
  }

  const hourMax = Math.max(...data.activity.byHourOfDay.map((h) => h.sessions));
  const dayMax = Math.max(...data.activity.byDayOfWeek.map((d) => d.sessions));

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <Sidebar projects={projects} activeProjectId={null} onSelectProject={() => {}} pathname={pathname} />

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="border-b border-border/50 bg-background/95 px-6 py-5 backdrop-blur">
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-xs text-muted-foreground">
            Usage metrics, session statistics, and activity patterns
          </p>
        </div>

        <div className="flex flex-col gap-6 p-6">

          {/* Overview cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total est. cost" value={formatCost(data.overview.totalCost)} sub={`across ${data.overview.activeDays} active days`} icon={DollarSign} accent="text-emerald-400" />
            <StatCard label="Avg daily cost" value={formatCost(data.overview.avgDailyCost)} sub={`${formatTokens(data.overview.avgDailyTokens)} tokens/day`} icon={TrendingUp} accent="text-sky-400" />
            <StatCard label="Avg daily sessions" value={data.overview.avgDailySessions.toFixed(1)} sub={`${formatNumber(data.sessionStats.totalSessions)} total`} icon={Activity} accent="text-[hsl(var(--brand))]" />
            <StatCard label="Avg session duration" value={formatDuration(data.sessionStats.avgDurationMs)} sub={`median: ${formatDuration(data.sessionStats.medianDurationMs)}`} icon={Clock} accent="text-amber-400" />
          </div>

          {/* Token usage by period */}
          <Card className="border-border/50 p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Token usage by period</h2>
              <span className="ml-auto text-[11px] text-muted-foreground">
                Cost estimates based on Opus 4 API rates
              </span>
            </div>
            <div className="overflow-x-auto">
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
                  {data.tokenPeriods.map((p) => {
                    const total = p.inputTokens + p.outputTokens + p.cacheReadTokens + p.cacheCreateTokens;
                    const cost = estimatePeriodCost(p);
                    return (
                      <tr key={p.label} className="border-b border-border/30 last:border-0">
                        <td className="py-2.5 pr-4 font-medium text-foreground">{p.label}</td>
                        <td className="py-2.5 pr-4 text-right font-mono text-muted-foreground tabular-nums">{formatTokens(p.inputTokens)}</td>
                        <td className="py-2.5 pr-4 text-right font-mono text-muted-foreground tabular-nums">{formatTokens(p.outputTokens)}</td>
                        <td className="py-2.5 pr-4 text-right font-mono text-muted-foreground tabular-nums">{formatTokens(p.cacheReadTokens)}</td>
                        <td className="py-2.5 pr-4 text-right font-mono text-muted-foreground tabular-nums">{formatTokens(p.cacheCreateTokens)}</td>
                        <td className="py-2.5 pr-4 text-right font-mono font-medium text-foreground tabular-nums">{formatTokens(total)}</td>
                        <td className="py-2.5 pr-4 text-right font-mono text-muted-foreground tabular-nums">{formatNumber(p.sessionCount)}</td>
                        <td className="py-2.5 text-right font-mono font-medium text-emerald-400 tabular-nums">{formatCost(cost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Session stats */}
          <Card className="border-border/50 p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Session statistics</h2>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg messages / session</span>
                <span className="font-mono tabular-nums">{data.sessionStats.avgMessagesPerSession.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg user prompts / session</span>
                <span className="font-mono tabular-nums">{data.sessionStats.avgUserMessagesPerSession.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg tokens / session</span>
                <span className="font-mono tabular-nums">{formatTokens(data.sessionStats.avgTokensPerSession)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Median duration</span>
                <span className="font-mono tabular-nums">{formatDuration(data.sessionStats.medianDurationMs)}</span>
              </div>
              {data.sessionStats.longestSession && (
                <div className="mt-2 rounded-md bg-muted/40 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Longest session</div>
                  <Link href={`/sessions/${data.sessionStats.longestSession.id}`} className="text-sm font-medium text-[hsl(var(--brand))] hover:underline flex items-center gap-1">
                    {formatDuration(data.sessionStats.longestSession.durationMs)}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {data.sessionStats.longestSession.projectName}
                    {data.sessionStats.longestSession.gist && ` — ${data.sessionStats.longestSession.gist}`}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Activity patterns */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/50 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Sessions by hour of day</h2>
              </div>
              <BarViz
                values={data.activity.byHourOfDay.map((h) => h.sessions)}
                max={hourMax}
                color="bg-[hsl(var(--brand))]"
              />
              <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground font-mono">
                <span>12am</span>
                <span>6am</span>
                <span>12pm</span>
                <span>6pm</span>
                <span>11pm</span>
              </div>
            </Card>

            <Card className="border-border/50 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Sessions by day of week</h2>
              </div>
              <div className="flex items-end gap-2 h-10">
                {data.activity.byDayOfWeek.map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-sm bg-sky-400 transition-all"
                      style={{ height: dayMax > 0 ? `${Math.max(2, (d.sessions / dayMax) * 40)}px` : "2px" }}
                      title={`${d.sessions} sessions`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-1.5">
                {data.activity.byDayOfWeek.map((d) => (
                  <div key={d.day} className="flex-1 text-center text-[10px] text-muted-foreground font-mono">
                    {d.day}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Model distribution + Cache efficiency */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/50 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Model distribution</h2>
              </div>
              <div className="space-y-2 text-sm">
                {data.modelDistribution.map((m) => {
                  const pct = data.sessionStats.totalSessions > 0
                    ? (m.sessions / data.sessionStats.totalSessions) * 100 : 0;
                  return (
                    <div key={m.model}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium truncate mr-2">{m.model}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="muted" className="font-mono text-[11px]">{m.sessions}</Badge>
                          <span className="font-mono text-xs text-emerald-400">{formatCost(m.cost)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                        <div className="h-full rounded-full bg-[hsl(var(--brand))]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="border-border/50 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Cache efficiency</h2>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cache hit rate</span>
                  <span className="font-mono tabular-nums font-medium">{(data.cacheEfficiency.cacheHitRate * 100).toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted/60 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${data.cacheEfficiency.cacheHitRate * 100}%` }} />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cache reads</span>
                  <span className="font-mono tabular-nums">{formatTokens(data.cacheEfficiency.totalCacheRead)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cache writes</span>
                  <span className="font-mono tabular-nums">{formatTokens(data.cacheEfficiency.totalCacheCreate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Direct input</span>
                  <span className="font-mono tabular-nums">{formatTokens(data.cacheEfficiency.totalInput)}</span>
                </div>
                <div className="mt-2 rounded-md bg-muted/40 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Estimated cache savings</div>
                  <div className="font-mono text-lg font-semibold text-emerald-400">{formatCost(data.cacheEfficiency.estimatedSavings)}</div>
                  <div className="text-[11px] text-muted-foreground">vs. paying full input rate for cached tokens</div>
                </div>
              </div>
            </Card>
          </div>

          {/* Project leaderboard */}
          <Card className="border-border/50 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Folder className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Project leaderboard</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Project</th>
                    <th className="pb-2 pr-4 font-medium text-right">Sessions</th>
                    <th className="pb-2 pr-4 font-medium text-right">Total tokens</th>
                    <th className="pb-2 pr-4 font-medium text-right">Avg duration</th>
                    <th className="pb-2 font-medium text-right">Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.projectLeaderboard.map((p) => (
                    <tr key={p.name} className="border-b border-border/30 last:border-0">
                      <td className="py-2.5 pr-4 font-medium text-foreground truncate max-w-[200px]">{p.name}</td>
                      <td className="py-2.5 pr-4 text-right font-mono text-muted-foreground tabular-nums">{formatNumber(p.sessions)}</td>
                      <td className="py-2.5 pr-4 text-right font-mono text-muted-foreground tabular-nums">{formatTokens(p.totalTokens)}</td>
                      <td className="py-2.5 pr-4 text-right font-mono text-muted-foreground tabular-nums">{formatDuration(p.avgDurationMs)}</td>
                      <td className="py-2.5 text-right font-mono font-medium text-emerald-400 tabular-nums">{formatCost(p.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

        </div>
      </main>
    </div>
  );
}
