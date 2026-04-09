import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

/** Root of Claude Code's user data. */
export const CLAUDE_HOME = join(homedir(), ".claude");

/** Root folder where Claude Code stores per-project JSONL sessions. */
export const CLAUDE_PROJECTS = join(CLAUDE_HOME, "projects");

/** Our app's data directory. */
export const APP_HOME = join(homedir(), ".claude-code-sessions");
export const APP_DB_PATH = join(APP_HOME, "index.db");
export const APP_MODELS_DIR = join(APP_HOME, "models");
export const APP_LOGS_DIR = join(APP_HOME, "logs");

/** launchd plist path. */
export const LAUNCHD_LABEL = "com.claude-code-sessions";
export const LAUNCHD_PLIST_PATH = join(
  homedir(),
  "Library",
  "LaunchAgents",
  `${LAUNCHD_LABEL}.plist`,
);

export function ensureAppDirs(): void {
  for (const dir of [APP_HOME, APP_MODELS_DIR, APP_LOGS_DIR]) {
    mkdirSync(dir, { recursive: true });
  }
}
