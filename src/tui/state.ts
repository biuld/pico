import type { SessionStore } from "../session/store";
import { DEFAULT_THEME_NAME, type ThemeName } from "./theme";

export type OverlayMode =
  | "none"
  | "slash"
  | "history"
  | "sessions"
  | "theme"
  | "transcript"
  | "shortcuts"
  | "approval";

export type TurnStatus = "idle" | "running" | "approval" | "failed";

export interface TuiState {
  selectedEntryId: string;
  selectedSessionId: string;
  overlay: OverlayMode;
  historyScroll: number;
  sessionScroll: number;
  transcriptScroll: number;
  slashSelection: number;
  themeSelection: number;
  approvalSelection: number;
  themeName: ThemeName;
  inputValue: string;
  turnStatus: TurnStatus;
  statusMessage?: string;
}

export function createTuiState(store?: SessionStore): TuiState {
  return {
    selectedEntryId: store?.leafId || "",
    selectedSessionId: store?.id || "",
    overlay: "none",
    historyScroll: 0,
    sessionScroll: 0,
    transcriptScroll: 0,
    slashSelection: 0,
    themeSelection: 0,
    approvalSelection: 0,
    themeName: DEFAULT_THEME_NAME,
    inputValue: "",
    turnStatus: "idle",
  };
}

export function updateInput(state: TuiState, inputValue: string): TuiState {
  return { ...state, inputValue };
}

export function selectEntry(state: TuiState, selectedEntryId: string): TuiState {
  return { ...state, selectedEntryId };
}

export function selectSession(state: TuiState, selectedSessionId: string): TuiState {
  return { ...state, selectedSessionId };
}

export function moveSelection(state: TuiState, entryIds: readonly string[], delta: number): TuiState {
  if (entryIds.length === 0) return state;
  const current = Math.max(0, entryIds.indexOf(state.selectedEntryId));
  const next = Math.max(0, Math.min(entryIds.length - 1, current + delta));
  return { ...state, selectedEntryId: entryIds[next] };
}

export function syncListScroll(
  state: TuiState,
  entryIds: readonly string[],
  viewportHeight: number,
): TuiState {
  const selectedIndex = entryIds.indexOf(state.selectedEntryId);
  if (selectedIndex < 0) return state;
  const height = Math.max(1, viewportHeight);
  let historyScroll = state.historyScroll;
  if (selectedIndex < historyScroll) historyScroll = selectedIndex;
  if (selectedIndex >= historyScroll + height) historyScroll = selectedIndex - height + 1;
  return { ...state, historyScroll: Math.max(0, historyScroll) };
}

export function moveSessionSelection(
  state: TuiState,
  sessionIds: readonly string[],
  delta: number,
): TuiState {
  if (sessionIds.length === 0) return state;
  const current = Math.max(0, sessionIds.indexOf(state.selectedSessionId));
  const next = Math.max(0, Math.min(sessionIds.length - 1, current + delta));
  return { ...state, selectedSessionId: sessionIds[next] };
}

export function syncSessionScroll(
  state: TuiState,
  sessionIds: readonly string[],
  viewportHeight: number,
): TuiState {
  const selectedIndex = sessionIds.indexOf(state.selectedSessionId);
  if (selectedIndex < 0) return state;
  const height = Math.max(1, viewportHeight);
  let sessionScroll = state.sessionScroll;
  if (selectedIndex < sessionScroll) sessionScroll = selectedIndex;
  if (selectedIndex >= sessionScroll + height) sessionScroll = selectedIndex - height + 1;
  return { ...state, sessionScroll: Math.max(0, sessionScroll) };
}

export function setOverlay(state: TuiState, overlay: OverlayMode): TuiState {
  return {
    ...state,
    overlay,
    slashSelection: overlay === "slash" ? state.slashSelection : 0,
    themeSelection: overlay === "theme" ? state.themeSelection : 0,
    approvalSelection: overlay === "approval" ? state.approvalSelection : 0,
  };
}

export function setTurnStatus(
  state: TuiState,
  turnStatus: TurnStatus,
  statusMessage?: string,
): TuiState {
  return { ...state, turnStatus, statusMessage };
}

export function scrollTranscript(state: TuiState, delta: number): TuiState {
  return {
    ...state,
    transcriptScroll: Math.max(0, state.transcriptScroll + delta),
  };
}

export function resetTranscriptScroll(state: TuiState): TuiState {
  return { ...state, transcriptScroll: 0 };
}

export function moveSlashSelection(state: TuiState, total: number, delta: number): TuiState {
  if (total <= 0) return { ...state, slashSelection: 0 };
  return {
    ...state,
    slashSelection: clamp(state.slashSelection + delta, 0, total - 1),
  };
}

export function syncSlashSelection(state: TuiState, total: number): TuiState {
  if (total <= 0) return { ...state, slashSelection: 0 };
  return { ...state, slashSelection: clamp(state.slashSelection, 0, total - 1) };
}

export function moveApprovalSelection(state: TuiState, total: number, delta: number): TuiState {
  if (total <= 0) return { ...state, approvalSelection: 0 };
  return {
    ...state,
    approvalSelection: clamp(state.approvalSelection + delta, 0, total - 1),
  };
}

export function moveThemeSelection(state: TuiState, total: number, delta: number): TuiState {
  if (total <= 0) return { ...state, themeSelection: 0 };
  return {
    ...state,
    themeSelection: clamp(state.themeSelection + delta, 0, total - 1),
  };
}

export function syncThemeSelection(state: TuiState, total: number): TuiState {
  if (total <= 0) return { ...state, themeSelection: 0 };
  return { ...state, themeSelection: clamp(state.themeSelection, 0, total - 1) };
}

export function selectTheme(state: TuiState, themeName: ThemeName): TuiState {
  return { ...state, themeName };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
