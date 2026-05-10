import type { SessionInfo } from "../../session/store";
import type { OverlayView } from "../overlay-model";
import type { TuiState } from "../state";

export interface SessionRow {
  id: string;
  isCurrent: boolean;
  isSelected: boolean;
  label?: string;
  createdAt: string;
  turnCount: number;
  responseItemCount: number;
}

export function buildResumeOverlayView(
  rows: readonly SessionRow[],
  state: TuiState,
  viewportHeight: number,
  rendererHeight: number,
): OverlayView {
  return {
    visible: true,
    title: "Resume",
    height: Math.min(12, Math.max(6, rendererHeight - 8)),
    fullScreen: false,
    scrollY: 0,
    content:
      rows.length > 0
        ? rows
            .slice(state.sessionScroll, state.sessionScroll + viewportHeight)
            .map(formatSessionRow)
            .join("\n")
        : "No saved sessions",
  };
}

export function buildSessionRows(
  sessions: readonly SessionInfo[],
  selectedSessionId: string,
  currentSessionId?: string,
): SessionRow[] {
  return sessions.map((session) => ({
    id: session.id,
    isCurrent: session.id === currentSessionId,
    isSelected: session.id === selectedSessionId,
    label: session.label,
    createdAt: session.createdAt,
    turnCount: session.turnCount,
    responseItemCount: session.responseItemCount,
  }));
}

export function formatSessionRow(row: SessionRow): string {
  const selected = row.isSelected ? ">" : " ";
  const current = row.isCurrent ? "*" : " ";
  const label = row.label ? ` "${row.label}"` : "";
  const created = row.createdAt.slice(0, 19).replace("T", " ");
  return `${selected}${current} ${shortId(row.id)}${label} turns=${row.turnCount} items=${row.responseItemCount} ${created}`;
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}
