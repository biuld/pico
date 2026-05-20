import { describe, test, expect } from "bun:test";
import { exportTranscriptToMarkdown, exportTranscriptToHtml } from "../../../src/tui/transcript/export";
import { userMessageCell, assistantMarkdownCell, systemNoticeCell, commandCell } from "../../../src/tui/transcript/cell";

describe("exportTranscriptToMarkdown", () => {
  test("exports user and assistant messages as markdown", () => {
    const cells = [
      userMessageCell("1", "Hello"),
      assistantMarkdownCell("2", "Hi there!"),
    ];
    const result = exportTranscriptToMarkdown(cells);
    expect(result).toContain("## User");
    expect(result).toContain("Hello");
    expect(result).toContain("## Assistant");
    expect(result).toContain("Hi there!");
  });

  test("preserves code blocks from assistant markdown", () => {
    const cells = [
      assistantMarkdownCell("1", "Here is code:\n```typescript\nconst x = 1;\n```"),
    ];
    const result = exportTranscriptToMarkdown(cells);
    expect(result).toContain("```typescript");
    expect(result).toContain("const x = 1;");
  });

  test("exports empty transcript as empty string", () => {
    expect(exportTranscriptToMarkdown([])).toBe("");
  });

  test("exports system notice cells", () => {
    const cells = [systemNoticeCell("1", "Something happened")];
    const result = exportTranscriptToMarkdown(cells);
    expect(result).toContain("Something happened");
  });

  test("exports command cells", () => {
    const cells = [commandCell({ id: "1", command: "npm test" })];
    const result = exportTranscriptToMarkdown(cells);
    expect(result).toContain("npm test");
  });
});

describe("exportTranscriptToHtml", () => {
  test("exports basic messages with HTML structure", () => {
    const cells = [userMessageCell("1", "Hello")];
    const result = exportTranscriptToHtml(cells);
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("Hello");
  });

  test("wraps code blocks in pre tags", () => {
    const cells = [assistantMarkdownCell("1", "```ts\nconst x = 1;\n```")];
    const result = exportTranscriptToHtml(cells);
    expect(result).toContain("<pre><code>");
    expect(result).toContain("const x = 1;");
  });
});
