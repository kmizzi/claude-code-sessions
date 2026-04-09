#!/usr/bin/env node
import { Command } from "commander";
import { serveCommand } from "./serve";
import { installServiceCommand } from "./install-service";
import { uninstallServiceCommand } from "./uninstall-service";
import { statusCommand } from "./status";

const program = new Command();

program
  .name("claude-code-sessions")
  .description("Browse, search, and manage your Claude Code conversation history.")
  .version("0.1.0");

program
  .command("serve")
  .description("Run the web server (default: http://localhost:5858)")
  .option("-p, --port <port>", "Port to listen on", "5858")
  .option("-H, --hostname <host>", "Hostname to bind to", "127.0.0.1")
  .action(async (opts) => {
    await serveCommand({ port: Number(opts.port), hostname: opts.hostname });
  });

program
  .command("install-service")
  .description("Install the launchd service so the app starts on login")
  .option("-p, --port <port>", "Port to use", "5858")
  .action(async (opts) => {
    await installServiceCommand({ port: Number(opts.port) });
  });

program
  .command("uninstall-service")
  .description("Remove the launchd service and stop the app")
  .action(async () => {
    await uninstallServiceCommand();
  });

program
  .command("status")
  .description("Show service and index status")
  .action(async () => {
    await statusCommand();
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
