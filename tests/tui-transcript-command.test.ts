import { expect, test } from "bun:test";
import { buildCommandHeader, formatCwdForHeader } from "../src/tui/widgets/transcript-panel/blocks";

// ── formatCwdForHeader ──

test("formatCwdForHeader: shows basename for long path", () => {
  expect(formatCwdForHeader("/Users/biu/Projects/pico")).toBe("pico");
});

test("formatCwdForHeader: shows basename for short absolute path", () => {
  expect(formatCwdForHeader("/app")).toBe("app");
});

test("formatCwdForHeader: handles paths with trailing slash", () => {
  expect(formatCwdForHeader("/home/user/")).toBe("user");
});

test("formatCwdForHeader: single segment path passes through", () => {
  expect(formatCwdForHeader("project")).toBe("project");
});

test("formatCwdForHeader: undefined returns undefined", () => {
  expect(formatCwdForHeader(undefined)).toBeUndefined();
});

test("formatCwdForHeader: empty string returns undefined", () => {
  expect(formatCwdForHeader("")).toBeUndefined();
});

test("formatCwdForHeader: truncates very long basename", () => {
  const longDir = "a".repeat(50);
  const cwd = `/home/${longDir}`;
  const result = formatCwdForHeader(cwd);
  expect(result).toBeDefined();
  expect(result!.length).toBeLessThanOrEqual(40);
  expect(result!.endsWith("...")).toBe(true);
});

test("formatCwdForHeader: backslash paths normalized", () => {
  expect(formatCwdForHeader("C:\\Users\\test")).toBe("test");
});

// ── buildCommandHeader ──

test("buildCommandHeader: shows command with cwd basename", () => {
  const info = buildCommandHeader({ command: "ls", cwd: "/app/project" });
  expect(info.text).toContain("$ ls");
  expect(info.text).toContain("project");
  expect(info.isFailed).toBe(false);
  expect(info.isRunning).toBe(false);
  expect(info.statusLabel).toBeNull();
});

test("buildCommandHeader: shows durationMs", () => {
  const info = buildCommandHeader({ command: "bun test", durationMs: 1234 });
  expect(info.text).toContain("1234ms");
});

test("buildCommandHeader: shows exit code", () => {
  const info = buildCommandHeader({ command: "ls", exitCode: 1 });
  expect(info.text).toContain("exit 1");
});

test("buildCommandHeader: exitCode 0 shown in header", () => {
  const info = buildCommandHeader({ command: "ls", exitCode: 0 });
  expect(info.text).toContain("exit 0");
});

test("buildCommandHeader: exitCode null omitted", () => {
  const info = buildCommandHeader({ command: "ls", exitCode: null });
  expect(info.text).not.toContain("exit");
});

test("buildCommandHeader: exitCode undefined omitted", () => {
  const info = buildCommandHeader({ command: "ls", exitCode: undefined });
  expect(info.text).not.toContain("exit");
});

test("buildCommandHeader: durationMs null omitted", () => {
  const info = buildCommandHeader({ command: "ls", durationMs: null });
  expect(info.text).not.toContain("ms");
});

test("buildCommandHeader: durationMs undefined omitted", () => {
  const info = buildCommandHeader({ command: "ls", durationMs: undefined });
  expect(info.text).not.toContain("ms");
});

test("buildCommandHeader: no cwd shows command only", () => {
  const info = buildCommandHeader({ command: "ls" });
  expect(info.text).toBe("$ ls");
});

test("buildCommandHeader: failed status sets isFailed and FAILED label", () => {
  const info = buildCommandHeader({ command: "rm -rf /", status: "failed", exitCode: 1 });
  expect(info.isFailed).toBe(true);
  expect(info.statusLabel).toBe("FAILED");
  expect(info.text).toContain("FAILED");
});

test("buildCommandHeader: declined status sets isFailed and DECLINED label", () => {
  const info = buildCommandHeader({ command: "rm -rf /", status: "declined" });
  expect(info.isFailed).toBe(true);
  expect(info.statusLabel).toBe("DECLINED");
  expect(info.text).toContain("DECLINED");
});

test("buildCommandHeader: running status not failed, shows RUNNING label", () => {
  const info = buildCommandHeader({ command: "sleep 10", status: "running", cwd: "/tmp" });
  expect(info.isFailed).toBe(false);
  expect(info.isRunning).toBe(true);
  expect(info.text).toContain("RUNNING");
  expect(info.text).not.toContain("exit");
  expect(info.text).not.toContain("ms");
});

test("buildCommandHeader: exitCode 0 alone is not failed", () => {
  const info = buildCommandHeader({ command: "true", exitCode: 0 });
  expect(info.isFailed).toBe(false);
  expect(info.statusLabel).toBeNull();
});

test("buildCommandHeader: complete header with all fields", () => {
  const info = buildCommandHeader({
    command: "bun build",
    cwd: "/Users/test/my-app",
    durationMs: 5432,
    exitCode: 2,
    status: "failed",
  });
  expect(info.text).toContain("$ bun build");
  expect(info.text).toContain("my-app");
  expect(info.text).toContain("5432ms");
  expect(info.text).toContain("exit 2");
  expect(info.text).toContain("FAILED");
  expect(info.isFailed).toBe(true);
  expect(info.isRunning).toBe(false);
});

test("buildCommandHeader: running command ignores exitCode", () => {
  // When running, even if exitCode is somehow set, isRunning takes priority
  const info = buildCommandHeader({ command: "sleep 10", status: "running", cwd: "/tmp", exitCode: 0 });
  expect(info.isRunning).toBe(true);
  expect(info.isFailed).toBe(false);
  expect(info.text).toContain("RUNNING");
  expect(info.text).not.toContain("exit");
});
