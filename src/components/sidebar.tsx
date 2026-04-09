"use client";

import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn, formatNumber } from "@/lib/utils";
import { relativeTime } from "@/lib/time";
import type { ProjectRow } from "@/lib/types";
import { Folder, Settings, LayoutGrid, MessageSquareText, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface Props {
  projects: ProjectRow[];
  activeProjectId: number | null;
  onSelectProject: (id: number | null) => void;
  pathname?: string;
}

export function Sidebar({ projects, activeProjectId, onSelectProject, pathname }: Props) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-border/50 bg-card/40">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[hsl(var(--brand)/0.15)] text-[hsl(var(--brand))]">
          <MessageSquareText className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight">Claude Code</div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Sessions
          </div>
        </div>
      </div>
      <Separator />
      <nav className="flex flex-col gap-1 px-3 py-3">
        <Link
          href="/"
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            (pathname === "/" || pathname?.startsWith("/sessions/")) && "bg-accent text-foreground",
          )}
        >
          <LayoutGrid className="h-4 w-4" /> All sessions
        </Link>
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            pathname === "/settings" && "bg-accent text-foreground",
          )}
        >
          <Settings className="h-4 w-4" /> Settings
        </Link>
      </nav>
      <Separator />
      <div className="flex items-center justify-between px-5 py-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        <span>Projects</span>
        <span>{projects.length}</span>
      </div>
      <ScrollArea className="flex-1 px-2 pb-4">
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => onSelectProject(null)}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              activeProjectId === null && "bg-accent text-foreground",
            )}
          >
            <span className="flex items-center gap-2 truncate">
              <Folder className="h-3.5 w-3.5" /> All
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatNumber(projects.reduce((a, p) => a + p.sessionCount, 0))}
            </span>
          </button>
          {projects.map((p) => {
            const isActive = p.id === activeProjectId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectProject(p.id)}
                className={cn(
                  "group flex w-full items-start justify-between gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  isActive && "bg-accent text-foreground",
                )}
                title={p.decodedPath}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.displayName}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {relativeTime(p.lastActiveAt)}
                  </div>
                </div>
                <Badge variant="muted" className="shrink-0 font-mono">
                  {p.sessionCount}
                </Badge>
              </button>
            );
          })}
        </div>
      </ScrollArea>
      <Separator />
      <div className="px-3 py-3">
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {mounted && theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {mounted ? (theme === "dark" ? "Light mode" : "Dark mode") : "Toggle theme"}
        </button>
      </div>
    </aside>
  );
}
