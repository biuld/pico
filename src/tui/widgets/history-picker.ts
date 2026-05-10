import { StyledText, bold, dim, fg } from "@opentui/core";
import type { HistoryTurnRow } from "../history";
import type { OverlayView } from "../overlay-model";
import type { TuiState } from "../state";
import type { TuiTheme } from "../theme";

export function buildHistoryOverlayView(
  rows: readonly HistoryTurnRow[],
  state: TuiState,
  theme: TuiTheme,
  viewportHeight: number,
  rendererHeight: number,
): OverlayView {
  return {
    visible: true,
    title: "History",
    height: Math.min(12, Math.max(6, rendererHeight - 8)),
    fullScreen: false,
    scrollY: 0,
    content:
      rows.length > 0
        ? historyContent(
            rows.slice(state.historyScroll, state.historyScroll + viewportHeight),
            theme,
          )
        : "No turns yet",
  };
}

function historyContent(rows: readonly HistoryTurnRow[], theme: TuiTheme): StyledText {
  const chunks: StyledText["chunks"] = [];
  const muted = fg(theme.colors.muted);
  const strong = fg(theme.colors.textStrong);

  rows.forEach((row, index) => {
    const selected = row.isSelected ? ">" : " ";
    const active = row.isActive ? "*" : " ";
    chunks.push(muted(`${selected}${active} ${row.userPrefix}`));
    chunks.push(row.isSelected ? bold(strong(row.userText)) : strong(row.userText));
    chunks.push(muted("\n"));
    chunks.push(muted(`   ${row.summaryPrefix}`));
    chunks.push(dim(muted(row.agentSummary)));
    if (index < rows.length - 1) chunks.push(muted("\n"));
  });

  return new StyledText(chunks);
}
