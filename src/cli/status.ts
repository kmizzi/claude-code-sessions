import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { LAUNCHD_LABEL, LAUNCHD_PLIST_PATH } from "@/lib/paths";

export async function statusCommand(): Promise<void> {
  console.log("claude-code-sessions status\n");

  // Service state
  const plistExists = existsSync(LAUNCHD_PLIST_PATH);
  console.log(`launchd plist:  ${plistExists ? LAUNCHD_PLIST_PATH : "(not installed)"}`);

  if (plistExists) {
    const uid = process.getuid ? process.getuid() : 501;
    const list = spawnSync("launchctl", ["print", `gui/${uid}/${LAUNCHD_LABEL}`], {
      encoding: "utf8",
    });
    if (list.status === 0) {
      const state = /state = (\w+)/.exec(list.stdout)?.[1] ?? "unknown";
      const pid = /pid = (\d+)/.exec(list.stdout)?.[1] ?? "—";
      console.log(`service state:  ${state}  (pid ${pid})`);
    } else {
      console.log("service state:  not loaded");
    }
  }

  // HTTP health
  const ports = [5858, 5859, 5860];
  for (const port of ports) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(500),
      });
      if (res.ok) {
        const json = (await res.json()) as { app?: string; version?: string };
        if (json.app === "claude-code-sessions") {
          console.log(`running at:     http://127.0.0.1:${port}  (v${json.version})`);
          break;
        }
      }
    } catch {
      // nothing on this port
    }
  }
}
