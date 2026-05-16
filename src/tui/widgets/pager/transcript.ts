import type { DraftAppState } from "../../../app/controller";
import type { OverlayView } from "../../core/overlay-model";
import type { TuiState } from "../../core/state";
import {
  blockText,
  buildTranscriptCellsWithLive,
  type TranscriptCell,
} from "../../transcript";
import { OVERLAY_HINTS } from "../overlay/hints";

export function buildTranscriptPagerOverlayView(
  app: DraftAppState,
  state: TuiState,
  streamingText: string,
  liveLeafId?: string,
): OverlayView {
  return {
    visible: true,
    title: "Transcript",
    fullScreen: false,
    scrollY: state.transcriptScroll,
    content: transcriptPagerText(buildTranscriptCellsWithLive(app, streamingText, liveLeafId)),
    footer: OVERLAY_HINTS.transcript,
  };
}

function transcriptPagerText(cells: readonly TranscriptCell[]): string {
  return cells
    .map((cell) => {
      const text = cell.blocks.map(blockText).filter(Boolean).join("\n");
      return `${cellPrefix(cell)} ${stripMarkdown(text)}`.trimEnd();
    })
    .filter(Boolean)
    .join("\n\n");
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`{1,2}([^`]+)`{1,2}/g, "$1")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
}

function cellPrefix(cell: TranscriptCell): string {
  switch (cell.kind) {
    case "user_message":
      return "›";
    case "reasoning":
    case "plan_update":
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
