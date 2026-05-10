#!/usr/bin/env bun

import { formatCliHelp, parseCliArgs } from "./cli";
import { createDraftApp, loadApp } from "./app/controller";
import { SessionStore } from "./session/store";
import { startOpenTui } from "./tui/opentui";

async function main(): Promise<void> {
  const options = parseCliArgs(Bun.argv.slice(2));

  if (options.command === "help") {
    console.log(formatCliHelp(Bun.argv[1] || "pico"));
    return;
  }

  if (options.command === "sessions") {
    const sessions = await SessionStore.list(options.cwd);
    for (const session of sessions) {
      console.log(
        `${session.id} leaf=${session.leafId} turns=${session.turnCount} items=${session.responseItemCount} ${
          session.label || ""
        }`,
      );
    }
    return;
  }

  try {
    const app = options.resumeSessionId
      ? await loadApp(options.cwd, options.resumeSessionId)
      : await createDraftApp(options.cwd);
    await startOpenTui(app);
  } catch (err) {
    console.error("Failed to start:", err);
    process.exit(1);
  }
}

main();
