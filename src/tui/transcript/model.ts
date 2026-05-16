import type { DraftAppState } from "../../app/controller";
import type { ThreadItem, Turn } from "@pico/codex-app-server-protocol/v2";
import { CodexThreadViewState } from "../../app/codex-thread-view-state";
import {
  assistantMarkdownCell,
  userMessageCell,
  type TranscriptCell,
} from "./cell";
import { threadItemToTranscriptCells } from "./thread-item";

export function buildTranscriptCells(
  viewState: CodexThreadViewState,
  turnIndex?: number,
): TranscriptCell[] {
  const cells: TranscriptCell[] = [];

  // Always render cached turns first
  const turns = viewState.turns;
  const startIdx = turnIndex !== undefined ? turnIndex : 0;
  const endIdx = turnIndex !== undefined ? turnIndex + 1 : turns.length;

  for (let i = startIdx; i < endIdx && i < turns.length; i++) {
    const turn = turns[i];
    for (const item of turn.items) {
      cells.push(...threadItemToTranscriptCells(item.id, item));
    }
  }

  // Append live user input first (before live items and streaming)
  if (viewState.liveUserInput) {
    cells.push(userMessageCell("live-user", viewState.liveUserInput, "started"));
  }

  // Append live turn items
  for (const item of viewState.liveTurnItems) {
    cells.push(...threadItemToTranscriptCells(item.id, item));
  }

  // Append streaming text
  if (viewState.streamingText) {
    cells.push(assistantMarkdownCell("live", viewState.streamingText, { streaming: true }));
  }

  return cells;
}

export function buildTranscriptCellsWithLive(
  app: DraftAppState,
  streamingText: string,
  liveThreadItems?: readonly ThreadItem[],
): TranscriptCell[] {
  const viewState = app.viewState;
  if (!viewState) return [];

  // buildTranscriptCells handles everything: cached turns + live items + streaming
  // liveThreadItems is kept for backward compat during migration
  if (liveThreadItems && liveThreadItems.length > 0 && viewState.liveTurnItems.length === 0) {
    // Migration path: live items from external source
    for (const item of liveThreadItems) {
      viewState.addLiveItem(item);
    }
  }

  const cells = buildTranscriptCells(viewState);

  // Ensure streaming text is appended if not already handled
  if (streamingText.length > 0 && !viewState.streamingText) {
    cells.push(assistantMarkdownCell("live", streamingText, { streaming: true }));
  }

  return cells;
}
