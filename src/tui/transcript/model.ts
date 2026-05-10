import type { DraftAppState } from "../../app/controller";
import type { PicoThreadStore } from "../../thread/store";
import {
  assistantMarkdownCell,
  reasoningCell,
  systemNoticeCell,
  userMessageCell,
  type TranscriptCell,
} from "./cell";
import { transcriptCellsForResponseItem } from "./response-item";

export function buildTranscriptCells(
  store: PicoThreadStore,
  leafId = store.leafId,
): TranscriptCell[] {
  return store.getPathEntries(leafId).flatMap((entry): TranscriptCell[] => {
    if (entry.type === "turn") {
      return [userMessageCell(entry.id, entry.userInput, entry.status)];
    }
    if (entry.type === "response_item") {
      return transcriptCellsForResponseItem(entry.id, entry.responseItem);
    }
    if (entry.type === "turn_failed") {
      return [systemNoticeCell(entry.id, entry.error, "failed")];
    }
    if (entry.type === "turn_aborted") {
      return [systemNoticeCell(entry.id, entry.reason || "Turn aborted", "aborted")];
    }
    return [];
  });
}

export function buildTranscriptCellsWithLive(
  app: DraftAppState,
  streamingText: string,
  liveStatus = "",
  liveLeafId?: string,
): TranscriptCell[] {
  const cells = app.store ? buildTranscriptCells(app.store, liveLeafId || app.store.leafId) : [];
  if (streamingText.length > 0) {
    cells.push(assistantMarkdownCell("live", streamingText, { streaming: true }));
  } else if (liveStatus.length > 0) {
    cells.push(reasoningCell("live-loading", liveStatus, "running"));
  }
  return cells;
}
