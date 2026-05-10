import { expect, test } from "bun:test";
import { formatCliHelp, parseCliArgs } from "../src/cli";

test("parses default TUI command", () => {
  expect(parseCliArgs([], "/repo")).toEqual({ command: "tui", cwd: "/repo" });
});

test("parses session listing and resume options", () => {
  expect(parseCliArgs(["--cwd", "/work", "--sessions"], "/repo")).toEqual({
    command: "sessions",
    cwd: "/work",
  });
  expect(parseCliArgs(["--resume", "session-1"], "/repo")).toEqual({
    command: "tui",
    cwd: "/repo",
    resumeSessionId: "session-1",
  });
});

test("rejects unknown args and missing values", () => {
  expect(() => parseCliArgs(["--cwd"], "/repo")).toThrow("--cwd requires a value");
  expect(() => parseCliArgs(["--bad"], "/repo")).toThrow("Unknown argument");
});

test("formats CLI help", () => {
  expect(formatCliHelp("pico")).toContain("Usage: pico");
  expect(formatCliHelp("pico")).toContain("--resume <id>");
});
