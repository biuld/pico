import { beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { picoConfig } from "../src/config";

let home: string;
let configPath: string;

beforeEach(async () => {
  picoConfig.reset();
  home = await mkdtemp(join(tmpdir(), "pico-home-"));
  configPath = join(home, ".pico", "config.json");
  Bun.env.HOME = home;
});

test("get returns default value when no file exists", () => {
  picoConfig.register({
    key: "default-test",
    default: "test-default",
    validate: () => undefined,
    description: "test",
  });
  expect(picoConfig.get("default-test")).toBe("test-default");
});

test("load overrides default with file value", async () => {
  picoConfig.register({
    key: "load-test",
    default: "test-default",
    validate: () => undefined,
    description: "test",
  });
  await mkdir(join(home, ".pico"), { recursive: true });
  await Bun.write(configPath, JSON.stringify({ "load-test": "from-file" }));

  await picoConfig.load();
  expect(picoConfig.get("load-test")).toBe("from-file");
});

test("load falls back to default when file value fails validation", async () => {
  picoConfig.register({
    key: "validate-test",
    default: "test-default",
    validate: (v) => typeof v === "string" ? undefined : "must be a string",
    description: "test",
  });
  await mkdir(join(home, ".pico"), { recursive: true });
  await Bun.write(configPath, JSON.stringify({ "validate-test": 123 }));

  await picoConfig.load();
  expect(picoConfig.get("validate-test")).toBe("test-default");
});

test("set persists value to file", async () => {
  picoConfig.register({
    key: "persist-test",
    default: "test-default",
    validate: () => undefined,
    description: "test",
  });

  await picoConfig.set("persist-test", "user-set");
  const file = JSON.parse(await Bun.file(configPath).text()) as Record<string, unknown>;
  expect(file["persist-test"]).toBe("user-set");
  expect(picoConfig.get("persist-test")).toBe("user-set");
});

test("file only contains user-set values, not defaults", async () => {
  picoConfig.register({
    key: "file-a",
    default: "default-a",
    validate: () => undefined,
    description: "test",
  });
  picoConfig.register({
    key: "file-b",
    default: "default-b",
    validate: () => undefined,
    description: "test",
  });

  await picoConfig.load();
  await picoConfig.set("file-a", "custom-a");

  const file = JSON.parse(await Bun.file(configPath).text()) as Record<string, unknown>;
  expect(file["file-a"]).toBe("custom-a");
  expect(file["file-b"]).toBeUndefined();
});

test("set rejects invalid values", async () => {
  picoConfig.register({
    key: "reject-test",
    default: "test-default",
    validate: (v) => typeof v === "string" ? undefined : "must be a string",
    description: "test",
  });

  await expect(picoConfig.set("reject-test", 123)).rejects.toThrow("must be a string");
});

test("snapshot returns all current values", () => {
  picoConfig.register({
    key: "snap-a",
    default: "a",
    validate: () => undefined,
    description: "test",
  });
  picoConfig.register({
    key: "snap-b",
    default: "b",
    validate: () => undefined,
    description: "test",
  });

  const snap = picoConfig.snapshot();
  expect(snap["snap-a"]).toBe("a");
  expect(snap["snap-b"]).toBe("b");
});

test("onChange notifies subscribers", async () => {
  picoConfig.register({
    key: "change-test",
    default: "test-default",
    validate: () => undefined,
    description: "test",
  });

  const values: unknown[] = [];
  picoConfig.onChange("change-test", (v) => values.push(v));

  await picoConfig.set("change-test", "first");
  await picoConfig.set("change-test", "second");

  expect(values).toEqual(["first", "second"]);
});
