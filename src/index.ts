#!/usr/bin/env bun

import { formatCliHelp, parseCliArgs } from "./cli";
import { createDraftApp, loadApp } from "./app/controller";
import { importCodexThreads } from "./import/codex-threads";
import { PicoThreadStore } from "./thread/store";
import { startOpenTui } from "./tui/opentui";

async function main(): Promise<void> {
  const options = parseCliArgs(Bun.argv.slice(2));

  if (options.command === "help") {
    console.log(formatCliHelp(Bun.argv[1] || "pico"));
    return;
  }

  if (options.command === "threads") {
    const threads = await PicoThreadStore.list(options.cwd);
    for (const thread of threads) {
      console.log(
        `${thread.id} leaf=${thread.leafId} turns=${thread.turnCount} items=${thread.responseItemCount} ${
          thread.label || ""
        }`,
      );
    }
    return;
  }

  if (options.command === "import") {
    const result = await importCodexThreads({
      cwd: options.cwd,
      allCwd: options.importAllCwd,
      dryRun: options.importDryRun,
    });
    const action = result.dryRun ? "would_import" : "imported";
    console.log(
      `Codex import: ${action}=${result.dryRun ? result.wouldImport : result.imported} skipped=${result.skipped} failed=${result.failed}`,
    );
    for (const thread of result.threads) {
      if (thread.status === "imported" || thread.status === "would_import") {
        console.log(
          `${thread.status} ${thread.codexThreadId} -> ${thread.picoThreadId} turns=${thread.turnCount || 0} items=${thread.responseItemCount || 0} ${thread.cwd || ""}`,
        );
      } else if (thread.status === "skipped") {
        console.log(`skipped ${thread.codexThreadId} ${thread.reason || ""}`);
      } else {
        console.log(`failed ${thread.codexThreadId} ${thread.reason || ""}`);
      }
    }
    if (result.failed > 0) process.exitCode = 1;
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
