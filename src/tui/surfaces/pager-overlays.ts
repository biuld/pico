import type { DraftAppState } from "../../app/controller";
import { emptyOverlay, type OverlayView } from "../core/overlay-model";
import type { TuiState } from "../core/state";
import { buildShortcutPagerOverlayView } from "../widgets/pager/shortcuts";
import { buildTranscriptPagerOverlayView } from "../widgets/pager/transcript";

export type PagerOverlayView = OverlayView;

export function emptyPagerOverlay(): PagerOverlayView {
  return emptyOverlay();
}

export interface PagerOverlayInput {
  app: DraftAppState;
  state: TuiState;
  streamingText: string;
  liveLeafId?: string;
}

export function buildPagerOverlay(input: PagerOverlayInput): PagerOverlayView {
  switch (input.state.pagerOverlay) {
    case "none":
      return emptyPagerOverlay();
    case "transcript":
      return buildTranscriptPagerOverlayView(
        input.app,
        input.state,
        input.streamingText,
        input.liveLeafId,
      );
    case "shortcuts":
      return buildShortcutPagerOverlayView();
  }
}
