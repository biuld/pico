import type { DraftAppState } from "../../app/controller";
import type { OverlayView } from "../overlay-model";
import type { TuiState } from "../state";
import { formatTranscript } from "../transcript";
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
    content: formatTranscript(app, streamingText, liveStatus, liveLeafId),
    footer: OVERLAY_HINTS.transcript,
  };
}
