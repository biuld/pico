import { describe, test, expect } from "bun:test";
import { extractTranscriptText, searchTranscript } from "../../../src/tui/transcript/search";
import { userMessageCell, assistantMarkdownCell, systemNoticeCell } from "../../../src/tui/transcript/cell";

describe("extractTranscriptText", () => {
  test("extracts plain text from user message cells", () => {
    const cells = [userMessageCell("1", "Hello, world!")];
    const results = extractTranscriptText(cells);
    expect(results.length).toBe(1);
    expect(results[0].text).toContain("Hello, world!");
    expect(results[0].cellId).toBe("1");
  });

  test("extracts plain text from assistant markdown cells", () => {
    const cells = [assistantMarkdownCell("2", "Here is some **markdown** text")];
    const results = extractTranscriptText(cells);
    expect(results.length).toBe(1);
    expect(results[0].text).toContain("Here is some");
  });

  test("strips markdown formatting for searchable text", () => {
    const cells = [assistantMarkdownCell("3", "# Heading\n\n**bold** and *italic* and `code`")];
    const results = extractTranscriptText(cells);
    expect(results[0].text).toContain("Heading");
    expect(results[0].text).toContain("bold");
    expect(results[0].text).toContain("italic");
  });

  test("handles empty transcript", () => {
    expect(extractTranscriptText([]).length).toBe(0);
  });

  test("skips cells with empty text", () => {
    const cells = [systemNoticeCell("1", "")];
    expect(extractTranscriptText(cells).length).toBe(0);
  });
});

describe("searchTranscript", () => {
  const cells = [
    userMessageCell("1", "Hello, world!"),
    assistantMarkdownCell("2", "Hi there! The world is round."),
    userMessageCell("3", "Tell me about Mars"),
  ];

  test("finds literal matches", () => {
    const results = searchTranscript(cells, "world");
    expect(results.length).toBe(2);
    expect(results[0].cellId).toBe("1");
    expect(results[1].cellId).toBe("2");
  });

  test("supports regex search", () => {
    const results = searchTranscript(cells, "\\b[Mm]ars\\b", { regex: true });
    expect(results.length).toBe(1);
    expect(results[0].cellId).toBe("3");
  });

  test("returns empty for no matches", () => {
    expect(searchTranscript(cells, "xyznonexistent").length).toBe(0);
  });

  test("case-insensitive by default", () => {
    expect(searchTranscript(cells, "hello").length).toBe(1);
  });

  test("case-sensitive when option set", () => {
    expect(searchTranscript(cells, "Hello", { caseSensitive: true }).length).toBe(1);
    expect(searchTranscript(cells, "hello", { caseSensitive: true }).length).toBe(0);
  });

  test("handles empty query", () => {
    expect(searchTranscript(cells, "").length).toBe(0);
  });
});
