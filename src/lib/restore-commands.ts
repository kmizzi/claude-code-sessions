/**
 * Generates shell commands that resume a Claude Code session in the directory
 * it was originally running in. Used by the "Recently active" panel so users
 * can recover from a crash by pasting a single command into a terminal.
 */

/** Safely wrap a string in bash single-quotes, escaping any embedded singles. */
function bashSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Escape a string for inclusion inside an AppleScript double-quoted string. */
function appleScriptString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** The shell one-liner for a single session. */
export function resumeCommand(cwd: string, sessionId: string): string {
  return `cd ${bashSingleQuote(cwd)} && claude --resume ${sessionId}`;
}

/**
 * Builds an `osascript` block that opens a single iTerm2 window split into
 * N vertical panes (side by side), each running `claude --resume` for the
 * corresponding session in its original cwd.
 */
export function iTerm2RestoreScript(
  sessions: Array<{ cwd: string; id: string }>,
): string {
  if (sessions.length === 0) return "";

  const lines: string[] = [
    `osascript <<'APPLESCRIPT'`,
    `tell application "iTerm"`,
    `  activate`,
    `  set theWindow to (create window with default profile)`,
    `  set s to current session of current tab of theWindow`,
  ];

  sessions.forEach((ses, i) => {
    const shellCmd = resumeCommand(ses.cwd, ses.id);
    const asStr = appleScriptString(shellCmd);
    if (i > 0) {
      lines.push(`  set s to (tell s to split vertically with default profile)`);
    }
    lines.push(`  tell s to write text ${asStr}`);
  });

  lines.push(`end tell`, `APPLESCRIPT`);
  return lines.join("\n");
}
