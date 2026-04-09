import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

interface ServeOptions {
  port: number;
  hostname: string;
}

/**
 * Starts the Next.js server.
 *
 * In production (after `npm run build`) we exec the standalone server at
 * `.next/standalone/server.js`. In dev (running from source) we fall back to
 * spawning `next dev --turbopack`, which gives hot reload.
 */
export async function serveCommand(opts: ServeOptions): Promise<void> {
  const port = opts.port;
  const hostname = opts.hostname;

  // Probe for an already-running instance
  const existing = await probeExisting(hostname, port);
  if (existing === "ours") {
    console.log(`claude-code-sessions is already running at http://${hostname}:${port}`);
    return;
  }
  if (existing === "conflict") {
    console.error(
      `Port ${port} is in use by another process. Pass --port <n> to choose another.`,
    );
    process.exit(2);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const standaloneServer = resolve(here, "../../.next/standalone/server.js");

  if (existsSync(standaloneServer)) {
    process.env.PORT = String(port);
    process.env.HOSTNAME = hostname;
    await import(standaloneServer);
    return;
  }

  // Dev fallback — exec next dev with the same args
  console.log("[serve] no standalone build found, launching `next dev --turbopack`…");
  const projectRoot = resolve(here, "../../");
  const child = spawn(
    "npx",
    ["next", "dev", "--turbopack", "-p", String(port), "-H", hostname],
    { cwd: projectRoot, stdio: "inherit" },
  );
  child.on("exit", (code) => process.exit(code ?? 0));
}

async function probeExisting(
  hostname: string,
  port: number,
): Promise<"ours" | "conflict" | "free"> {
  try {
    const res = await fetch(`http://${hostname}:${port}/api/health`, {
      signal: AbortSignal.timeout(500),
    });
    if (!res.ok) return "conflict";
    const json = (await res.json()) as { app?: string };
    return json.app === "claude-code-sessions" ? "ours" : "conflict";
  } catch {
    return "free";
  }
}
