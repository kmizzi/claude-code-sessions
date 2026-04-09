import { basename } from "node:path";

/**
 * Claude Code encodes a cwd path by replacing every `/` with `-`.
 * e.g. /home/user/code/foo -> -home-user-code-foo
 *
 * ⚠ This encoding is LOSSY. Both /home/user/foo-bar and /home/user/foo/bar
 * encode to -home-user-foo-bar. Always prefer the `cwd` field inside the
 * JSONL itself as ground truth. These helpers are for display fallback only.
 */

/** Heuristic decode — splits on `-` and joins with `/`. Lossy, use only as a fallback. */
export function decodeEncodedPath(encoded: string): string {
  if (!encoded.startsWith("-")) return encoded;
  return encoded.replace(/-/g, "/");
}

/** Human-readable name for a project: last segment of the cwd/decoded path. */
export function displayNameForPath(path: string): string {
  const clean = path.replace(/\/+$/, "");
  const name = basename(clean);
  return name || clean || "(root)";
}

export function encodePathForClaude(absPath: string): string {
  return absPath.replace(/\//g, "-");
}
