import { slashQuery } from "./commands";
import {
  closeFocusSurfaces,
  moveApprovalSelection,
  moveSelection,
  moveSlashSelection,
  moveStatusLineSelection,
  moveThemeSelection,
  moveThreadSelection,
  resetTranscriptScroll,
  scrollTranscript,
  selectEntry,
  selectThread,
  selectTheme,
  setBottomPaneView,
  setPagerOverlay,
  setPickerSurface,
  setTurnStatus,
  syncListScroll,
  syncSlashSelection,
  syncStatusLineSelection,
  syncThemeSelection,
  syncThreadScroll,
  toggleStatusLineItem,
  updateInput,
  type TuiState,
  type TurnStatus,
} from "./state";
import type { StatusLineItemId } from "./statusline";
import type { ThemeName } from "./theme";

export type TuiMsg =
  | { type: "inputChanged"; value: string }
  | { type: "setInput"; value: string }
  | { type: "closeSurface" }
  | { type: "openHistory"; leafId: string }
  | { type: "openThreads"; threadId: string }
  | { type: "openTheme" }
  | { type: "openStatusLine" }
  | { type: "openTranscript" }
  | { type: "openShortcuts" }
  | { type: "showApproval" }
  | { type: "moveHistory"; entryIds: readonly string[]; delta: number; viewportHeight: number }
  | { type: "syncHistory"; entryIds: readonly string[]; viewportHeight: number }
  | { type: "moveThread"; threadIds: readonly string[]; delta: number; viewportHeight: number }
  | { type: "syncThreads"; threadIds: readonly string[]; viewportHeight: number }
  | { type: "moveSlash"; total: number; delta: number }
  | { type: "syncSlash"; total: number }
  | { type: "moveTheme"; total: number; delta: number }
  | { type: "syncTheme"; total: number }
  | { type: "moveStatusLine"; total: number; delta: number }
  | { type: "syncStatusLine"; total: number }
  | { type: "toggleStatusLineItem"; item: StatusLineItemId }
  | { type: "moveApproval"; total: number; delta: number }
  | { type: "scrollTranscript"; delta: number }
  | { type: "jumpTranscriptTop" }
  | { type: "jumpTranscriptBottom" }
  | { type: "selectEntry"; entryId: string }
  | { type: "setTurnStatus"; status: TurnStatus; message?: string }
  | { type: "restoreCompleted"; branchId: string; targetId: string }
  | { type: "renameCompleted"; entryId: string }
  | { type: "resumeCompleted"; threadId: string }
  | { type: "themeSelected"; themeName: ThemeName };

export function updateTuiState(state: TuiState, msg: TuiMsg): TuiState {
  switch (msg.type) {
    case "inputChanged": {
      let next = updateInput(state, msg.value);
      const query = slashQuery(msg.value);
      if (next.bottomPane.activeView === "commandPopup" && query === undefined) {
        next = setBottomPaneView(next, "none");
      } else if (
        next.bottomPane.activeView === "none" &&
        next.pickerSurface === "none" &&
        next.pagerOverlay === "none" &&
        query !== undefined
      ) {
        next = setBottomPaneView(next, "commandPopup");
      }
      return next;
    }
    case "setInput":
      return updateInput(state, msg.value);
    case "closeSurface":
      return closeFocusSurfaces(state);
    case "openHistory":
      return setPickerSurface(selectEntry(state, msg.leafId), "history");
    case "openThreads":
      return setPickerSurface(selectThread(state, msg.threadId), "resume");
    case "openTheme":
      return setBottomPaneView(state, "themePicker");
    case "openStatusLine":
      return setBottomPaneView(state, "statuslinePicker");
    case "openTranscript":
      return setPagerOverlay(resetTranscriptScroll(state), "transcript");
    case "openShortcuts":
      return setPagerOverlay(state, "shortcuts");
    case "showApproval":
      return setBottomPaneView(
        { ...setTurnStatus(state, "approval"), approvalSelection: 0 },
        "approval",
      );
    case "moveHistory":
      return syncListScroll(
        moveSelection(state, msg.entryIds, msg.delta),
        msg.entryIds,
        msg.viewportHeight,
      );
    case "syncHistory":
      return syncListScroll(state, msg.entryIds, msg.viewportHeight);
    case "moveThread":
      return syncThreadScroll(
        moveThreadSelection(state, msg.threadIds, msg.delta),
        msg.threadIds,
        msg.viewportHeight,
      );
    case "syncThreads":
      return syncThreadScroll(state, msg.threadIds, msg.viewportHeight);
    case "moveSlash":
      return moveSlashSelection(state, msg.total, msg.delta);
    case "syncSlash":
      return syncSlashSelection(state, msg.total);
    case "moveTheme":
      return moveThemeSelection(state, msg.total, msg.delta);
    case "syncTheme":
      return syncThemeSelection(state, msg.total);
    case "moveStatusLine":
      return moveStatusLineSelection(state, msg.total, msg.delta);
    case "syncStatusLine":
      return syncStatusLineSelection(state, msg.total);
    case "toggleStatusLineItem":
      return toggleStatusLineItem(state, msg.item);
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
      return closeFocusSurfaces(
        setTurnStatus(selectEntry(state, msg.branchId), "idle", `backtracked ${shortId(msg.targetId)}`),
      );
    case "renameCompleted":
      return setTurnStatus(state, "idle", `renamed ${shortId(msg.entryId)}`);
    case "resumeCompleted":
      return closeFocusSurfaces(
        setTurnStatus(selectThread(state, msg.threadId), "idle", `resumed ${shortId(msg.threadId)}`),
      );
    case "themeSelected":
      return closeFocusSurfaces(
        setTurnStatus(selectTheme(state, msg.themeName), "idle", `theme ${msg.themeName}`),
      );
  }
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}
