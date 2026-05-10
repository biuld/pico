import { slashQuery } from "./commands";
import {
  moveApprovalSelection,
  moveLaunchpadSelection,
  moveSelection,
  moveThreadSelection,
  moveSlashSelection,
  moveStatusLineSelection,
  moveThemeSelection,
  resetTranscriptScroll,
  scrollTranscript,
  selectEntry,
  selectThread,
  selectTheme,
  setOverlay,
  setTurnStatus,
  syncListScroll,
  syncLaunchpadSelection,
  syncThreadScroll,
  syncSlashSelection,
  syncStatusLineSelection,
  syncThemeSelection,
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
  | { type: "closeOverlay" }
  | { type: "openHistory"; leafId: string }
  | { type: "openThreads"; threadId: string }
  | { type: "openTheme" }
  | { type: "openStatusLine" }
  | { type: "openTranscript" }
  | { type: "openShortcuts" }
  | { type: "openLaunchpad" }
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
  | { type: "moveLaunchpad"; total: number; delta: number }
  | { type: "syncLaunchpad"; total: number }
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
    case "openThreads":
      return setOverlay(selectThread(state, msg.threadId), "threads");
    case "openTheme":
      return setOverlay(state, "theme");
    case "openStatusLine":
      return setOverlay(state, "statusline");
    case "openTranscript":
      return setOverlay(resetTranscriptScroll(state), "transcript");
    case "openShortcuts":
      return setOverlay(state, "shortcuts");
    case "openLaunchpad":
      return setOverlay(state, "launchpad");
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
    case "moveLaunchpad":
      return moveLaunchpadSelection(state, msg.total, msg.delta);
    case "syncLaunchpad":
      return syncLaunchpadSelection(state, msg.total);
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
      return setOverlay(
        setTurnStatus(selectEntry(state, msg.branchId), "idle", `backtracked ${shortId(msg.targetId)}`),
        "none",
      );
    case "renameCompleted":
      return setTurnStatus(state, "idle", `renamed ${shortId(msg.entryId)}`);
    case "resumeCompleted":
      return setOverlay(
        setTurnStatus(selectThread(state, msg.threadId), "idle", `resumed ${shortId(msg.threadId)}`),
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
