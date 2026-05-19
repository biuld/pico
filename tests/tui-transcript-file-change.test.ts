import { expect, test } from "bun:test";
import { buildFileChangeInfo } from "../src/tui/widgets/transcript-panel/blocks";

// ── kind symbols ──

test("buildFileChangeInfo: A for add kind", () => {
  const info = buildFileChangeInfo({ path: "src/new.ts", kind: "add" });
  expect(info.kindSymbol).toBe("A");
  expect(info.headerText).toContain("A src/new.ts");
  expect(info.isFailed).toBe(false);
  expect(info.statusLabel).toBeNull();
});

test("buildFileChangeInfo: D for delete kind", () => {
  const info = buildFileChangeInfo({ path: "src/old.ts", kind: "delete" });
  expect(info.kindSymbol).toBe("D");
  expect(info.headerText).toContain("D src/old.ts");
});

test("buildFileChangeInfo: M for update kind", () => {
  const info = buildFileChangeInfo({ path: "src/index.ts", kind: "update" });
  expect(info.kindSymbol).toBe("M");
  expect(info.headerText).toContain("M src/index.ts");
});

test("buildFileChangeInfo: M for modify kind", () => {
  const info = buildFileChangeInfo({ path: "src/index.ts", kind: "modify" });
  expect(info.kindSymbol).toBe("M");
});

test("buildFileChangeInfo: ~ for unknown kind", () => {
  const info = buildFileChangeInfo({ path: "file.txt", kind: "rename" });
  expect(info.kindSymbol).toBe("~");
});

test("buildFileChangeInfo: ~ for missing kind", () => {
  const info = buildFileChangeInfo({ path: "file.txt" });
  expect(info.kindSymbol).toBe("~");
});

test("buildFileChangeInfo: ~ for undefined kind", () => {
  const info = buildFileChangeInfo({ path: "file.txt", kind: undefined });
  expect(info.kindSymbol).toBe("~");
});

// ── header text ──

test("buildFileChangeInfo: summary used when no path", () => {
  const info = buildFileChangeInfo({ summary: "Created 3 files" });
  expect(info.headerText).toContain("Created 3 files");
});

test("buildFileChangeInfo: file change fallback when no path or summary", () => {
  const info = buildFileChangeInfo({});
  expect(info.headerText).toContain("file change");
});

test("buildFileChangeInfo: path preferred over summary in header", () => {
  const info = buildFileChangeInfo({ path: "a.ts", summary: "Edit a.ts", kind: "update" });
  expect(info.headerText).toContain("M a.ts");
});

// ── status labels ──

test("buildFileChangeInfo: failed status sets FAILED label", () => {
  const info = buildFileChangeInfo({ path: "config.ts", kind: "update", status: "failed" });
  expect(info.isFailed).toBe(true);
  expect(info.statusLabel).toBe("FAILED");
  expect(info.headerText).toContain("FAILED");
});

test("buildFileChangeInfo: declined status sets DECLINED label", () => {
  const info = buildFileChangeInfo({ path: "config.ts", kind: "update", status: "declined" });
  expect(info.isFailed).toBe(true);
  expect(info.statusLabel).toBe("DECLINED");
  expect(info.headerText).toContain("DECLINED");
});

test("buildFileChangeInfo: completed status not failed", () => {
  const info = buildFileChangeInfo({ path: "file.ts", kind: "update", status: "completed" });
  expect(info.isFailed).toBe(false);
  expect(info.statusLabel).toBeNull();
});

test("buildFileChangeInfo: no status not failed", () => {
  const info = buildFileChangeInfo({ path: "file.ts", kind: "add" });
  expect(info.isFailed).toBe(false);
  expect(info.statusLabel).toBeNull();
});

// ── diff line count ──

test("buildFileChangeInfo: diffLineCount matches unified diff +/- lines", () => {
  const info = buildFileChangeInfo({
    path: "src/index.ts",
    kind: "update",
    diff: "@@ -1 +1 @@\n-old line\n+new line",
  });
  expect(info.diffLineCount).toBe(2);
});

test("buildFileChangeInfo: diffLineCount counts only + and - lines", () => {
  const info = buildFileChangeInfo({
    path: "src/index.ts",
    kind: "update",
    diff: "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,3 +1,4 @@\n context line\n-old1\n-old2\n+new1\n+new2\n+new3\n more context",
  });
  // + lines: 3 (new1, new2, new3), - lines: 2 (old1, old2) = 5 total
  expect(info.diffLineCount).toBe(5);
});

test("buildFileChangeInfo: diffLineCount null when no diff", () => {
  const info = buildFileChangeInfo({ path: "src/index.ts", kind: "update" });
  expect(info.diffLineCount).toBeNull();
});

test("buildFileChangeInfo: diffLineCount 0 for empty diff string", () => {
  const info = buildFileChangeInfo({ path: "empty.ts", kind: "add", diff: "" });
  expect(info.diffLineCount).toBe(0);
});
