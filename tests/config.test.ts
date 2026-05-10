import { beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPicoConfig, updateProjectPicoConfig } from "../src/config";

let home: string;
let cwd: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "pico-home-"));
  cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  Bun.env.HOME = home;
});

test("persists project statusline items without dropping existing config", async () => {
  await mkdir(join(cwd, ".pico"), { recursive: true });
  await Bun.write(
    join(cwd, ".pico", "config.json"),
    JSON.stringify({ model: "project-model" }),
  );

  await updateProjectPicoConfig(cwd, {
    statusLineItems: ["model", "provider", "thread-id"],
  });

  await expect(loadPicoConfig(cwd)).resolves.toEqual({
    model: "project-model",
    statusLineItems: ["model", "provider", "thread-id"],
    cwd,
  });
});

test("loads global and project Pico config with project overrides", async () => {
  await mkdir(join(home, ".pico"), { recursive: true });
  await mkdir(join(cwd, ".pico"), { recursive: true });
  await Bun.write(
    join(home, ".pico", "config.json"),
    JSON.stringify({ model: "global-model", approvalPolicy: "onRequest" }),
  );
  await Bun.write(
    join(cwd, ".pico", "config.json"),
    JSON.stringify({ model: "project-model", codexBinary: "/tmp/codex" }),
  );

  await expect(loadPicoConfig(cwd)).resolves.toEqual({
    model: "project-model",
    approvalPolicy: "onRequest",
    codexBinary: "/tmp/codex",
    cwd,
  });
});
