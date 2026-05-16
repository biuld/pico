#!/usr/bin/env bun

import { formatCliHelp, parseCliArgs } from "./cli";
import { createDraftApp, loadApp } from "./app/controller";
import { picoConfig } from "./config";
import { CodexThreadState } from "./app/codex-thread-state";
import { CodexAppServerClient } from "./codex/app-server";
import { startOpenTui } from "./tui/opentui";

async function main(): Promise<void> {
  const options = parseCliArgs(Bun.argv.slice(2));
  await picoConfig.load();

  if (options.command === "help") {
    console.log(formatCliHelp(Bun.argv[1] || "pico"));
    return;
  }

  if (options.command === "threads") {
    const codex = new CodexAppServerClient({ binary: picoConfig.get<string>("codexBinary") });
    await codex.start();
    try {
      const threads = await CodexThreadState.list(options.cwd, codex);
      for (const thread of threads) {
        console.log(
          `${thread.id} leaf=${thread.leafId} turns=${thread.turnCount} items=${thread.responseItemCount}`,
        );
      }
    } finally {
      await codex.shutdown();
    }
    return;
  }

  try {
    const app = options.resumeThreadId
      ? await loadApp(options.cwd, options.resumeThreadId)
      : await createDraftApp(options.cwd);
    await startOpenTui(app);
  } catch (err) {
    console.error("Failed to start:", err);
    process.exit(1);
  }
}

main();
