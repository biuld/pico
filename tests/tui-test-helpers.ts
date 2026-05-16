import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../src/tui/config";
import { CodexThreadState } from "../src/app/codex-thread-state";

export async function createStore(): Promise<CodexThreadState> {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;
  return CodexThreadState.create(cwd);
}
