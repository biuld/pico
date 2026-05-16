import type { HistoryTurnRow } from "../history";
import { emptyOverlay, type OverlayView } from "../core/overlay-model";
import type { TuiState } from "../core/state";
import type { TuiTheme } from "../theme";
import { buildHistoryPickerSurfaceView } from "../widgets/pickers/history";
import { buildResumePickerSurfaceView, type ThreadRow } from "../widgets/pickers/resume";

export type PickerSurfaceView = OverlayView;

export function emptyPickerSurface(): PickerSurfaceView {
  return emptyOverlay();
}

export interface PickerSurfaceInput {
  state: TuiState;
  theme: TuiTheme;
  historyRows: readonly HistoryTurnRow[];
  threadRows: readonly ThreadRow[];
  threadViewportHeight: number;
  rendererWidth: number;
}

export function buildPickerSurface(input: PickerSurfaceInput): PickerSurfaceView {
  switch (input.state.pickerSurface) {
    case "none":
      return emptyPickerSurface();
    case "history":
      return buildHistoryPickerSurfaceView(input.historyRows, input.state, input.theme);
    case "resume":
      return buildResumePickerSurfaceView(
        input.threadRows,
        input.state,
        input.theme,
        input.threadViewportHeight,
        input.rendererWidth,
      );
  }
}

export function pickerSurfaceListViewportHeight(
  rendererHeight: number,
  bottomInset: number,
): number {
  const surfaceHeight = Math.max(1, rendererHeight - Math.max(0, bottomInset));
  return Math.max(1, surfaceHeight - 3);
}
