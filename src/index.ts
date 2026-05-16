#!/usr/bin/env bun

import { formatCliHelp, parseCliArgs } from "./cli";
import { createDraftApp, loadApp } from "./app/controller";
import { picoConfig } from "./config";
// import { importCodexThreads } from "./import/codex-threads";
import { PicoThreadStore } from "./thread/store";
import { startOpenTui } from "./tui/opentui";

async function main(): Promise<void> {
  const options = parseCliArgs(Bun.argv.slice(2));
  await picoConfig.load();

  if (options.command === "help") {
    console.log(formatCliHelp(Bun.argv[1] || "pico"));
    return;
  }

  if (options.command === "threads") {
    const threads = await PicoThreadStore.list(options.cwd);
    for (const thread of threads) {
      console.log(
        `${thread.id} leaf=${thread.leafId} turns=${thread.turnCount} items=${thread.responseItemCount}`,
      );
    }
    return;
  }

  // TODO: re-enable after import module is updated for RolloutLine V3 format
  // if (options.command === "import") {
  //   const result = await importCodexThreads({
  //     cwd: options.cwd,
  //     allCwd: options.importAllCwd,
  //     dryRun: options.importDryRun,
  //   });
  //   ...
  //   return;
  // }

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
