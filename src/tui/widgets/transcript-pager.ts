import type { DraftAppState } from "../../app/controller";
import type { OverlayView } from "../overlay-model";
import type { TuiState } from "../state";
import { formatTranscript } from "../transcript";

export function buildTranscriptPagerOverlayView(
  app: DraftAppState,
  state: TuiState,
  streamingText: string,
  rendererHeight: number,
): OverlayView {
  return {
    visible: true,
    title: "Transcript",
    height: rendererHeight,
    fullScreen: true,
    scrollY: state.transcriptScroll,
    content: formatTranscript(app, streamingText),
  };
}
