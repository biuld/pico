import { historyUserMarker, type HistoryTurnRow } from "../../history";
import type { OverlayView } from "../core/overlay-model";
import type { TuiState } from "../core/state";
import type { TuiTheme } from "../../theme";
import { OVERLAY_HINTS } from "../overlay/hints";
import { selectableOverlayRow } from "../overlay/rows";

export const HISTORY_ROW_HEIGHT = 2;

export function buildHistoryPickerSurfaceView(
  rows: readonly HistoryTurnRow[],
  state: TuiState,
  theme: TuiTheme,
): OverlayView {
  return {
    visible: true,
    title: "History",
    fullScreen: false,
    scrollY: 0,
    content: rows.length > 0 ? "" : "No turns yet",
    rows: rows.map((row, index) => selectableOverlayRow({
      id: row.id,
      content: historyRowText(row),
      height: HISTORY_ROW_HEIGHT,
      index,
      isSelected: row.isSelected,
    }, theme)),
    rowScrollY: state.historyScroll * HISTORY_ROW_HEIGHT,
    footer: OVERLAY_HINTS.history,
  };
}

function historyRowText(row: HistoryTurnRow): string {
  return [
    `${row.userPrefix}${historyUserMarker(row)}${row.userText}`,
    `${row.summaryPrefix}${historyUserMarker(row)}${row.agentSummary}`,
  ].join("\n");
}
