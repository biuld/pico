import type { TranscriptCell } from "../../transcript";

const OUTPUT_PREVIEW_LINE_LIMIT = 5;
const OUTPUT_PREVIEW_LINE_LENGTH = 160;
const TRANSCRIPT_HINT = "ctrl + t to view transcript";

export type MainTranscriptMuteStrategy =
  | "expanded"
  | "reasoning-summary"
  | "tool-call-summary"
  | "tool-output-preview"
  | "command-output-preview"
  | "file-summary";

export function isMainTranscriptCellExpandedByDefault(cell: TranscriptCell): boolean {
  return mainTranscriptMuteStrategyForCell(cell) === "expanded";
}

export function mainTranscriptMuteStrategyForCell(cell: TranscriptCell): MainTranscriptMuteStrategy {
  if (
    cell.kind === "user_message" ||
    cell.kind === "assistant_markdown" ||
    cell.kind === "plan_update" ||
    cell.kind === "system_notice" ||
    (cell.kind === "reasoning" && cell.status === "running")
  ) {
    return "expanded";
  }
  switch (cell.kind) {
    case "reasoning":
      return "reasoning-summary";
    case "tool_call":
      return "tool-call-summary";
    case "tool_output":
      return "tool-output-preview";
    case "command":
      return "command-output-preview";
    case "file_change":
      return "file-summary";
  }
}

export function compactTranscriptPreview(text: string, maxLength = 120): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  if (maxLength <= 3) return ".".repeat(Math.max(0, maxLength));
  return `${compact.slice(0, maxLength - 3)}...`;
}

export function limitedTranscriptOutputLines(
  text: string,
  lineLimit = OUTPUT_PREVIEW_LINE_LIMIT,
  maxLineLength = OUTPUT_PREVIEW_LINE_LENGTH,
): { lines: string[]; omitted: number } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
    .map((line) => truncateOutputLine(line, maxLineLength));
  if (lines.at(-1) === "") lines.pop();
  if (lineLimit <= 0) return { lines: [], omitted: lines.length };
  if (lines.length <= lineLimit) return { lines, omitted: 0 };

  const visibleLines = Math.max(0, lineLimit - 1);
  const headCount = Math.floor(visibleLines / 2);
  const tailCount = visibleLines - headCount;
  const head = headCount > 0 ? lines.slice(0, headCount) : [];
  const tail = tailCount > 0 ? lines.slice(-tailCount) : [];
  const omitted = lines.length - head.length - tail.length;
  return {
    lines: [...head, `... +${omitted} lines (${TRANSCRIPT_HINT})`, ...tail],
    omitted,
  };
}

export function formatMainTranscriptOutputPreview(
  text: string,
  options: {
    includeAnglePipe?: boolean;
    includePrefix?: boolean;
    lineLimit?: number;
    maxLineLength?: number;
  } = {},
): string {
  const { lines } = limitedTranscriptOutputLines(
    text,
    options.lineLimit ?? OUTPUT_PREVIEW_LINE_LIMIT,
    options.maxLineLength ?? OUTPUT_PREVIEW_LINE_LENGTH,
  );
  const includePrefix = options.includePrefix ?? true;
  return lines
    .map((line, index) => {
      if (!includePrefix) return line;
      if (options.includeAnglePipe && index === 0) return `  └ ${line}`;
      return `    ${line}`;
    })
    .join("\n");
}

function truncateOutputLine(line: string, maxLength: number): string {
  if (maxLength <= 0) return "";
  if (line.length <= maxLength) return line;
  if (maxLength <= 3) return ".".repeat(maxLength);

  const marker = "...";
  const available = maxLength - marker.length;
  const headLength = Math.ceil(available / 2);
  const tailLength = Math.floor(available / 2);
  return `${line.slice(0, headLength)}${marker}${line.slice(line.length - tailLength)}`;
}
