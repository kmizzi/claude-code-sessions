"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { RecentlyActive } from "@/components/recently-active";
import type { ProjectRow } from "@/lib/types";

export default function RecoveryPage() {
  const pathname = usePathname();
  const [projects, setProjects] = useState<ProjectRow[]>([]);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((j: { projects?: ProjectRow[] }) => setProjects(j.projects ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar
        projects={projects}
        activeProjectId={null}
        onSelectProject={() => {}}
        pathname={pathname}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-auto">
        <div className="border-b border-border/50 bg-background/95 px-6 py-5 backdrop-blur">
          <h1 className="text-xl font-semibold tracking-tight">Recovery</h1>
          <p className="text-xs text-muted-foreground">
            Live sessions and recently-closed groups — copy a restore script to bring them back after a crash.
          </p>
        </div>
        <div className="flex-1 px-6 py-5">
          <RecentlyActive refreshSignal={0} />
        </div>
      </main>
    </div>
  );
}
