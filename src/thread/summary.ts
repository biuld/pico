import { entryMovesLeaf } from "./entries";
import type {
  PicoThreadEntry,
  PicoThreadHeader,
  PicoThreadInfo,
} from "./types";

export function summarizeThreadJsonl(lines: readonly unknown[]): PicoThreadInfo | undefined {
  if (lines.length === 0) return undefined;

  const header = lines[0] as PicoThreadHeader;
  let leafId = header.id;
  let updatedAt = header.createdAt;
  let preview = "";
  let turnCount = 0;
  let responseItemCount = 0;
  let label: string | undefined;

  for (const raw of lines.slice(1)) {
    const entry = raw as PicoThreadEntry;
    if (entryMovesLeaf(entry)) leafId = entry.id;
    if (entry.timestamp) updatedAt = entry.timestamp;
    if (entry.type === "turn" && !preview) preview = previewText(entry.userInput);
    if (entry.type === "turn") turnCount++;
    if (entry.type === "response_item") responseItemCount++;
    if (entry.type === "label") label = entry.label;
  }

  return {
    id: header.id,
    leafId,
    cwd: header.cwd,
    createdAt: header.createdAt,
    updatedAt,
    preview,
    turnCount,
    responseItemCount,
    label,
  };
}

function previewText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
