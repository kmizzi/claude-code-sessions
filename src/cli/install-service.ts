import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  APP_HOME,
  APP_LOGS_DIR,
  LAUNCHD_LABEL,
  LAUNCHD_PLIST_PATH,
  ensureAppDirs,
} from "@/lib/paths";

interface InstallOptions {
  port: number;
}

/**
 * Installs a launchd LaunchAgent that runs `claude-code-sessions serve` on login.
 *
 * - Writes the plist to ~/Library/LaunchAgents/com.claude-code-sessions.plist
 * - Bootstraps it via `launchctl bootstrap gui/<uid>` (the modern replacement for
 *   `launchctl load`, which Apple has been deprecating).
 * - Sets StandardOut/ErrPath to files under ~/.claude-code-sessions/logs/ so the
 *   Settings page can tail them.
 */
export async function installServiceCommand(opts: InstallOptions): Promise<void> {
  ensureAppDirs();

  // Resolve the bin path — this is what launchd will exec
  const binPath = resolveBinPath();
  if (!binPath) {
    console.error(
      "Could not resolve the `claude-code-sessions` bin path. " +
        "Install the package globally with `npm install -g claude-code-sessions` first.",
    );
    process.exit(1);
  }

  // Use the absolute path to node from process.execPath, so we don't depend
  // on the shell PATH at launchd boot time.
  const nodePath = process.execPath;

  mkdirSync(dirname(LAUNCHD_PLIST_PATH), { recursive: true });
  mkdirSync(APP_LOGS_DIR, { recursive: true });

  const plist = buildPlist({
    label: LAUNCHD_LABEL,
    nodePath,
    binPath,
    port: opts.port,
    stdoutLog: resolve(APP_LOGS_DIR, "stdout.log"),
    stderrLog: resolve(APP_LOGS_DIR, "stderr.log"),
    workingDir: APP_HOME,
  });

  writeFileSync(LAUNCHD_PLIST_PATH, plist, { mode: 0o644 });
  console.log(`Wrote ${LAUNCHD_PLIST_PATH}`);

  // Unload any previous instance first (idempotent install)
  const uid = process.getuid ? process.getuid() : 501;
  const domain = `gui/${uid}`;
  spawnSync("launchctl", ["bootout", domain, LAUNCHD_PLIST_PATH], {
    stdio: "ignore",
  });

  const bootstrap = spawnSync(
    "launchctl",
    ["bootstrap", domain, LAUNCHD_PLIST_PATH],
    { stdio: "inherit" },
  );
  if (bootstrap.status !== 0) {
    console.error(`launchctl bootstrap failed with status ${bootstrap.status}`);
    process.exit(bootstrap.status ?? 1);
  }

  console.log(
    `\n✓ Service installed and running.\n  UI: http://127.0.0.1:${opts.port}\n  Logs: ${APP_LOGS_DIR}`,
  );
}

function resolveBinPath(): string | null {
  // Walk up from this file to find either:
  //   1. A sibling `bin/claude-code-sessions.mjs` (dev / npm link)
  //   2. A global install via `which claude-code-sessions`
  try {
    // Prefer which — it's what the user actually has on PATH
    const which = spawnSync("which", ["claude-code-sessions"], {
      encoding: "utf8",
    });
    const p = which.stdout.trim();
    if (p && existsSync(p)) return p;
  } catch {}

  // Fallback: look relative to this file
  // (We can't use import.meta.url here in a generic way since the compiled
  // location differs; but the launcher in bin/claude-code-sessions.mjs is
  // stable.)
  const candidates = [
    resolve(homedir(), ".local/bin/claude-code-sessions"),
    "/usr/local/bin/claude-code-sessions",
    "/opt/homebrew/bin/claude-code-sessions",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

function buildPlist(args: {
  label: string;
  nodePath: string;
  binPath: string;
  port: number;
  stdoutLog: string;
  stderrLog: string;
  workingDir: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${args.label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${args.nodePath}</string>
    <string>${args.binPath}</string>
    <string>serve</string>
    <string>--port</string>
    <string>${args.port}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${args.workingDir}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${args.stdoutLog}</string>
  <key>StandardErrorPath</key>
  <string>${args.stderrLog}</string>
  <key>ProcessType</key>
  <string>Background</string>
  <key>Nice</key>
  <integer>5</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
`;
}
