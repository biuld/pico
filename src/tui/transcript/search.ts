import type { TranscriptCell } from "./cell";
import { blockText } from "./cell";

export interface TextSegment {
  cellId: string;
  text: string;
  lineIndex: number;
}

export interface TranscriptSearchResult {
  cellId: string;
  match: string;
  startIndex: number;
  endIndex: number;
  lineIndex: number;
}

export interface SearchOptions {
  regex?: boolean;
  caseSensitive?: boolean;
}

export function extractTranscriptText(cells: readonly TranscriptCell[]): TextSegment[] {
  const segments: TextSegment[] = [];
  for (const cell of cells) {
    for (let i = 0; i < cell.blocks.length; i++) {
      const text = blockText(cell.blocks[i]);
      const plain = stripMarkdown(text);
      if (plain.trim()) {
        segments.push({ cellId: cell.id, text: plain, lineIndex: i });
      }
    }
  }
  return segments;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function searchTranscript(
  cells: readonly TranscriptCell[],
  query: string,
  options: SearchOptions = {},
): TranscriptSearchResult[] {
  if (!query) return [];
  const segments = extractTranscriptText(cells);
  const results: TranscriptSearchResult[] = [];
  const flags = options.caseSensitive ? "g" : "gi";
  const pattern = options.regex
    ? new RegExp(query, flags)
    : new RegExp(escapeRegex(query), flags);

  for (const segment of segments) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(segment.text)) !== null) {
      results.push({
        cellId: segment.cellId,
        match: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length,
        lineIndex: segment.lineIndex,
      });
    }
  }

  return results;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
