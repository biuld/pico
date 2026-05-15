import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../src/tui/config";
import { PicoThreadStore } from "../src/thread/store";

export async function createStore(): Promise<PicoThreadStore> {
  const cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  const home = await mkdtemp(join(tmpdir(), "pico-home-"));
  Bun.env.HOME = home;
  return PicoThreadStore.create(cwd);
}
