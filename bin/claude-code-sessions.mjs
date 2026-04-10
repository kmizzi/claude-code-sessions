#!/usr/bin/env node
// Thin launcher — delegates to the compiled CLI entry so this file works
// whether the user runs it from a git clone (dev) or an installed package.
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));

// Prefer the built standalone entry, fall back to ts dev mode via tsx/next
const candidates = [
  resolve(here, "../dist/cli/index.js"),
  resolve(here, "../src/cli/index.ts"),
];

let entry = null;
for (const c of candidates) {
  if (existsSync(c)) {
    entry = c;
    break;
  }
}

if (!entry) {
  console.error("claude-code-sessions: could not locate CLI entry. Run `npm run build` first.");
  process.exit(1);
}

if (entry.endsWith(".ts")) {
  // Dev mode — use tsx loader (register installs a global resolver hook)
  const { register } = await import("tsx/esm/api");
  register();
  await import(entry);
} else {
  await import(entry);
}
