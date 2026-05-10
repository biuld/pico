import type { DraftAppState } from "../../app/controller";
import type { OverlayView } from "../overlay-model";
import type { TuiState } from "../state";
import {
  blockText,
  buildTranscriptCellsWithLive,
  type TranscriptCell,
} from "../transcript";
import { OVERLAY_HINTS } from "./overlay-hints";

export function buildTranscriptPagerOverlayView(
  app: DraftAppState,
  state: TuiState,
  streamingText: string,
  rendererHeight: number,
  liveStatus = "",
  liveLeafId?: string,
): OverlayView {
  return {
    visible: true,
    title: "Transcript",
    height: rendererHeight,
    fullScreen: true,
    scrollY: state.transcriptScroll,
    content: transcriptPagerText(buildTranscriptCellsWithLive(app, streamingText, liveStatus, liveLeafId)),
    footer: OVERLAY_HINTS.transcript,
  };
}

function transcriptPagerText(cells: readonly TranscriptCell[]): string {
  return cells
    .map((cell) => `${cellPrefix(cell)} ${cell.blocks.map(blockText).filter(Boolean).join("\n")}`.trimEnd())
    .filter(Boolean)
    .join("\n\n");
}

function cellPrefix(cell: TranscriptCell): string {
  switch (cell.kind) {
    case "user_message":
      return "›";
    case "reasoning":
      return "•";
    case "tool_call":
    case "tool_output":
      return "↳";
    case "command":
      return "$";
    case "file_change":
      return "~";
    case "system_notice":
      return cell.status === "failed" ? "!" : "•";
    case "assistant_markdown":
      return "•";
  }
}
