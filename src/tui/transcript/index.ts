import type { StyledText } from "@opentui/core";
import type { DraftAppState } from "../../app/controller";
import type { TuiTheme } from "../theme";
import {
  transcriptCellFromRow,
  transcriptCellsFromRows,
  type TranscriptCell,
} from "./cell";
import {
  buildTranscriptRowsWithLive,
  type TranscriptRow,
} from "./model";
import {
  renderTranscriptCellPlain,
  renderTranscriptCellStyled,
  renderTranscriptLines,
  renderTranscriptLinesStyled,
  renderTranscriptPlain,
  transcriptLineText,
} from "./renderer";

export {
  TRANSCRIPT_TEXT_BLOCK,
  isTextTranscriptBlock,
  textTranscriptBlock,
  transcriptCellFromRow,
  transcriptCellsFromRows,
  type TranscriptBlock,
  type TranscriptCell,
  type TranscriptCellKind,
  type TranscriptTextPayload,
  type TranscriptTone,
} from "./cell";
export {
  buildTranscriptRows,
  buildTranscriptRowsWithLive,
  type TranscriptRole,
  type TranscriptRow,
  type TranscriptRowKind,
} from "./model";
export {
  transcriptRowsForResponseItem,
} from "./response-item";
export {
  renderTranscriptCellLines,
  renderTranscriptCellPlain,
  renderTranscriptCellStyled,
  renderTranscriptLines,
  renderTranscriptLinesStyled,
  renderTranscriptPlain,
  renderTranscriptStyled,
  transcriptLineBodyText,
  transcriptLineText,
  type TranscriptBlockRenderer,
  type TranscriptDisplayLine,
  type TranscriptLineSegment,
  type TranscriptRenderOptions,
} from "./renderer";
export {
  displayWidth,
  wrapTranscriptText,
} from "./wrap";

export function formatTranscript(
  app: DraftAppState,
  streamingText: string,
  liveStatus = "",
  liveLeafId?: string,
): string {
  return renderTranscriptPlain(transcriptCellsForApp(app, streamingText, liveStatus, liveLeafId), 80);
}

export function formatMainTranscript(
  app: DraftAppState,
  streamingText: string,
  maxLines: number,
  width = 80,
  liveStatus = "",
  liveLeafId?: string,
): string {
  const lines = renderTranscriptLines(transcriptCellsForApp(app, streamingText, liveStatus, liveLeafId), width)
    .map(transcriptLineText);
  return lines.slice(-Math.max(1, maxLines)).join("\n");
}

export function formatMainTranscriptStyled(
  app: DraftAppState,
  streamingText: string,
  maxLines: number,
  width: number,
  theme: TuiTheme,
  liveStatus = "",
  liveLeafId?: string,
): StyledText {
  const lines = renderTranscriptLines(transcriptCellsForApp(app, streamingText, liveStatus, liveLeafId), width)
    .slice(-Math.max(1, maxLines));
  return renderTranscriptLinesStyled(lines, theme);
}

export function formatTranscriptRowStyled(
  row: TranscriptRow,
  width: number,
  theme: TuiTheme,
): StyledText {
  return renderTranscriptCellStyled(transcriptCellFromRow(row), width, theme);
}

export function formatTranscriptRow(row: TranscriptRow, width = 80): string {
  return renderTranscriptCellPlain(transcriptCellFromRow(row), width);
}

function transcriptCellsForApp(
  app: DraftAppState,
  streamingText: string,
  liveStatus = "",
  liveLeafId?: string,
): TranscriptCell[] {
  return transcriptCellsFromRows(buildTranscriptRowsWithLive(app, streamingText, liveStatus, liveLeafId));
}
