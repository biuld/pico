import { entryMovesLeaf } from "./entries";
import { entryUserText } from "./store";
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

  for (const raw of lines.slice(1)) {
    const entry = raw as PicoThreadEntry;
    if (entryMovesLeaf(entry)) leafId = entry.id;
    if (entry.timestamp) updatedAt = entry.timestamp;
    const userText = entryUserText(entry);
    if (userText) {
      if (!preview) preview = previewText(userText);
      turnCount++;
    }
    if (entry.item?.type === "response_item") responseItemCount++;
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
  };
}

function previewText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
