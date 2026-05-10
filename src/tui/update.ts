import { slashQuery } from "./commands";
import {
  moveApprovalSelection,
  moveSelection,
  moveSessionSelection,
  moveSlashSelection,
  moveThemeSelection,
  resetTranscriptScroll,
  scrollTranscript,
  selectEntry,
  selectSession,
  selectTheme,
  setOverlay,
  setTurnStatus,
  syncListScroll,
  syncSessionScroll,
  syncSlashSelection,
  syncThemeSelection,
  updateInput,
  type TuiState,
  type TurnStatus,
} from "./state";
import type { ThemeName } from "./theme";

export type TuiMsg =
  | { type: "inputChanged"; value: string }
  | { type: "setInput"; value: string }
  | { type: "closeOverlay" }
  | { type: "openHistory"; leafId: string }
  | { type: "openSessions"; sessionId: string }
  | { type: "openTheme" }
  | { type: "openTranscript" }
  | { type: "openShortcuts" }
  | { type: "showApproval" }
  | { type: "moveHistory"; entryIds: readonly string[]; delta: number; viewportHeight: number }
  | { type: "syncHistory"; entryIds: readonly string[]; viewportHeight: number }
  | { type: "moveSession"; sessionIds: readonly string[]; delta: number; viewportHeight: number }
  | { type: "syncSessions"; sessionIds: readonly string[]; viewportHeight: number }
  | { type: "moveSlash"; total: number; delta: number }
  | { type: "syncSlash"; total: number }
  | { type: "moveTheme"; total: number; delta: number }
  | { type: "syncTheme"; total: number }
  | { type: "moveApproval"; total: number; delta: number }
  | { type: "scrollTranscript"; delta: number }
  | { type: "jumpTranscriptTop" }
  | { type: "jumpTranscriptBottom" }
  | { type: "selectEntry"; entryId: string }
  | { type: "setTurnStatus"; status: TurnStatus; message?: string }
  | { type: "restoreCompleted"; branchId: string; targetId: string }
  | { type: "renameCompleted"; entryId: string }
  | { type: "resumeCompleted"; sessionId: string }
  | { type: "themeSelected"; themeName: ThemeName };

export function updateTuiState(state: TuiState, msg: TuiMsg): TuiState {
  switch (msg.type) {
    case "inputChanged": {
      let next = updateInput(state, msg.value);
      const query = slashQuery(msg.value);
      if (next.overlay === "slash" && query === undefined) {
        next = setOverlay(next, "none");
      } else if (next.overlay === "none" && query !== undefined) {
        next = setOverlay(next, "slash");
      }
      return next;
    }
    case "setInput":
      return updateInput(state, msg.value);
    case "closeOverlay":
      return setOverlay(state, "none");
    case "openHistory":
      return setOverlay(selectEntry(state, msg.leafId), "history");
    case "openSessions":
      return setOverlay(selectSession(state, msg.sessionId), "sessions");
    case "openTheme":
      return setOverlay(state, "theme");
    case "openTranscript":
      return setOverlay(resetTranscriptScroll(state), "transcript");
    case "openShortcuts":
      return setOverlay(state, "shortcuts");
    case "showApproval":
      return setOverlay(setTurnStatus(state, "approval"), "approval");
    case "moveHistory":
      return syncListScroll(
        moveSelection(state, msg.entryIds, msg.delta),
        msg.entryIds,
        msg.viewportHeight,
      );
    case "syncHistory":
      return syncListScroll(state, msg.entryIds, msg.viewportHeight);
    case "moveSession":
      return syncSessionScroll(
        moveSessionSelection(state, msg.sessionIds, msg.delta),
        msg.sessionIds,
        msg.viewportHeight,
      );
    case "syncSessions":
      return syncSessionScroll(state, msg.sessionIds, msg.viewportHeight);
    case "moveSlash":
      return moveSlashSelection(state, msg.total, msg.delta);
    case "syncSlash":
      return syncSlashSelection(state, msg.total);
    case "moveTheme":
      return moveThemeSelection(state, msg.total, msg.delta);
    case "syncTheme":
      return syncThemeSelection(state, msg.total);
    case "moveApproval":
      return moveApprovalSelection(state, msg.total, msg.delta);
    case "scrollTranscript":
      return scrollTranscript(state, msg.delta);
    case "jumpTranscriptTop":
      return { ...state, transcriptScroll: 0 };
    case "jumpTranscriptBottom":
      return { ...state, transcriptScroll: Number.MAX_SAFE_INTEGER };
    case "selectEntry":
      return selectEntry(state, msg.entryId);
    case "setTurnStatus":
      return setTurnStatus(state, msg.status, msg.message);
    case "restoreCompleted":
      return setOverlay(
        setTurnStatus(selectEntry(state, msg.branchId), "idle", `backtracked ${shortId(msg.targetId)}`),
        "none",
      );
    case "renameCompleted":
      return setTurnStatus(state, "idle", `renamed ${shortId(msg.entryId)}`);
    case "resumeCompleted":
      return setOverlay(
        setTurnStatus(selectSession(state, msg.sessionId), "idle", `resumed ${shortId(msg.sessionId)}`),
        "none",
      );
    case "themeSelected":
      return setOverlay(
        setTurnStatus(selectTheme(state, msg.themeName), "idle", `theme ${msg.themeName}`),
        "none",
      );
  }
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}
