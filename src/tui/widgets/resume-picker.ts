import type { PicoThreadInfo } from "../../thread/store";
import type { OverlayView } from "../overlay-model";
import type { TuiState } from "../state";
import { OVERLAY_HINTS } from "./overlay-hints";

export interface ThreadRow {
  id: string;
  isCurrent: boolean;
  isSelected: boolean;
  label?: string;
  createdAt: string;
  updatedAt: string;
  preview: string;
  turnCount: number;
  responseItemCount: number;
}

export function buildResumeOverlayView(
  rows: readonly ThreadRow[],
  state: TuiState,
  viewportHeight: number,
  rendererHeight: number,
): OverlayView {
  return {
    visible: true,
    title: "Resume",
    height: Math.min(14, Math.max(8, rendererHeight - 8)),
    fullScreen: false,
    scrollY: 0,
    content: rows.length > 0
      ? rows
        .slice(state.threadScroll, state.threadScroll + viewportHeight)
        .map(formatThreadRow)
        .join("\n")
      : "No saved threads",
    footer: OVERLAY_HINTS.resume,
  };
}

export function buildThreadRows(
  threads: readonly PicoThreadInfo[],
  selectedThreadId: string,
  currentThreadId?: string,
): ThreadRow[] {
  return threads.map((thread) => ({
    id: thread.id,
    isCurrent: thread.id === currentThreadId,
    isSelected: thread.id === selectedThreadId,
    label: thread.label,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    preview: thread.preview,
    turnCount: thread.turnCount,
    responseItemCount: thread.responseItemCount,
  }));
}

export function formatThreadRow(row: ThreadRow): string {
  const selected = row.isSelected ? ">" : " ";
  const current = row.isCurrent ? "*" : " ";
  const title = row.label || row.preview;
  const titleText = title ? ` "${title}"` : "";
  const updated = row.updatedAt.slice(0, 19).replace("T", " ");
  return `${selected}${current} ${shortId(row.id)}${titleText} turns=${row.turnCount} items=${row.responseItemCount} ${updated}`;
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}
