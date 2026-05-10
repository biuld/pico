import { beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPicoConfig } from "../src/config";

let home: string;
let cwd: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "pico-home-"));
  cwd = await mkdtemp(join(tmpdir(), "pico-cwd-"));
  Bun.env.HOME = home;
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
