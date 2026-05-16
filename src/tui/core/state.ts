import { picoConfig } from "../../config";
import type { CodexThreadViewState } from "../../app/codex-thread-view-state";
import { normalizeStatusLineItems, type StatusLineItemId } from "../statusline";
import { DEFAULT_THEME_NAME, type ThemeName } from "../theme";
import "../config";

export type BottomPaneViewKind =
  | "none"
  | "approval"
  | "commandPopup"
  | "themePicker"
  | "statuslinePicker";

export type PickerSurfaceKind = "none" | "history" | "resume";

export type PagerOverlayKind = "none" | "transcript" | "shortcuts";

export type TurnStatus = "idle" | "running" | "approval" | "failed";

export interface BottomPaneState {
  draft: string;
  activeView: BottomPaneViewKind;
  turnStatus: TurnStatus;
  statusMessage?: string;
}

export interface TuiState {
  selectedTurnIndex: number;
  selectedItemId: string | null;
  selectedThreadId: string;
  bottomPane: BottomPaneState;
  pickerSurface: PickerSurfaceKind;
  pagerOverlay: PagerOverlayKind;
  historyScroll: number;
  threadScroll: number;
  transcriptScroll: number;
  slashSelection: number;
  themeSelection: number;
  statusLineSelection: number;
  statusLineItems: StatusLineItemId[];
  approvalSelection: number;
  themeName: ThemeName;
}

export function createTuiState(viewState?: CodexThreadViewState): TuiState {
  const turns = viewState?.turns ?? [];
  return {
    selectedTurnIndex: Math.max(0, turns.length - 1),
    selectedItemId: null,
    selectedThreadId: viewState?.id || "",
    bottomPane: {
      draft: "",
      activeView: "none",
      turnStatus: "idle",
    },
    pickerSurface: "none",
    pagerOverlay: "none",
    historyScroll: 0,
    threadScroll: 0,
    transcriptScroll: 0,
    slashSelection: 0,
    themeSelection: 0,
    statusLineSelection: 0,
    statusLineItems: normalizeStatusLineItems(picoConfig.get<string[]>("statusLineItems")),
    approvalSelection: 0,
    themeName: picoConfig.get<string>("theme") as ThemeName,
  };
}

export function updateInput(state: TuiState, draft: string): TuiState {
  return { ...state, bottomPane: { ...state.bottomPane, draft } };
}

export function selectTurn(state: TuiState, selectedTurnIndex: number): TuiState {
  return { ...state, selectedTurnIndex, selectedItemId: null };
}

export function selectItem(state: TuiState, selectedItemId: string): TuiState {
  return { ...state, selectedItemId };
}

export function selectThread(state: TuiState, selectedThreadId: string): TuiState {
  return { ...state, selectedThreadId };
}

export function moveSelection(state: TuiState, total: number, delta: number): TuiState {
  if (total <= 0) return state;
  const next = Math.max(0, Math.min(total - 1, state.selectedTurnIndex + delta));
  return { ...state, selectedTurnIndex: next };
}

export function syncListScroll(
  state: TuiState,
  total: number,
  viewportHeight: number,
): TuiState {
  const height = Math.max(1, viewportHeight);
  let historyScroll = state.historyScroll;
  if (state.selectedTurnIndex < historyScroll) historyScroll = state.selectedTurnIndex;
  if (state.selectedTurnIndex >= historyScroll + height) historyScroll = state.selectedTurnIndex - height + 1;
  return { ...state, historyScroll: Math.max(0, historyScroll) };
}

export function moveThreadSelection(
  state: TuiState,
  threadIds: readonly string[],
  delta: number,
): TuiState {
  if (threadIds.length === 0) return state;
  const current = Math.max(0, threadIds.indexOf(state.selectedThreadId));
  const next = Math.max(0, Math.min(threadIds.length - 1, current + delta));
  return { ...state, selectedThreadId: threadIds[next] };
}

export function syncThreadScroll(
  state: TuiState,
  threadIds: readonly string[],
  viewportHeight: number,
): TuiState {
  const selectedIndex = threadIds.indexOf(state.selectedThreadId);
  if (selectedIndex < 0) return state;
  const height = Math.max(1, viewportHeight);
  let threadScroll = state.threadScroll;
  if (selectedIndex < threadScroll) threadScroll = selectedIndex;
  if (selectedIndex >= threadScroll + height) threadScroll = selectedIndex - height + 1;
  return { ...state, threadScroll: Math.max(0, threadScroll) };
}

export function setBottomPaneView(
  state: TuiState,
  activeView: BottomPaneViewKind,
): TuiState {
  return {
    ...state,
    bottomPane: { ...state.bottomPane, activeView },
    pickerSurface: activeView === "none" ? state.pickerSurface : "none",
    pagerOverlay: activeView === "none" ? state.pagerOverlay : "none",
    slashSelection: activeView === "commandPopup" ? state.slashSelection : 0,
    themeSelection: activeView === "themePicker" ? state.themeSelection : 0,
    statusLineSelection: activeView === "statuslinePicker" ? state.statusLineSelection : 0,
  };
}

export function setPickerSurface(
  state: TuiState,
  pickerSurface: PickerSurfaceKind,
): TuiState {
  return {
    ...state,
    bottomPane: {
      ...state.bottomPane,
      activeView: pickerSurface === "none" ? state.bottomPane.activeView : "none",
    },
    pickerSurface,
    pagerOverlay: pickerSurface === "none" ? state.pagerOverlay : "none",
  };
}

export function setPagerOverlay(state: TuiState, pagerOverlay: PagerOverlayKind): TuiState {
  return {
    ...state,
    bottomPane: {
      ...state.bottomPane,
      activeView: pagerOverlay === "none" ? state.bottomPane.activeView : "none",
    },
    pickerSurface: pagerOverlay === "none" ? state.pickerSurface : "none",
    pagerOverlay,
  };
}

export function closeFocusSurfaces(state: TuiState): TuiState {
  return {
    ...state,
    bottomPane: { ...state.bottomPane, activeView: "none" },
    pickerSurface: "none",
    pagerOverlay: "none",
    slashSelection: 0,
    themeSelection: 0,
    statusLineSelection: 0,
  };
}

export function bottomPaneBlocksComposerInput(state: TuiState): boolean {
  return state.bottomPane.activeView === "approval" ||
    state.bottomPane.activeView === "themePicker" ||
    state.bottomPane.activeView === "statuslinePicker";
}

export function pickerSurfaceOwnsFocus(state: TuiState): boolean {
  return state.pickerSurface !== "none";
}

export function pagerOverlayOwnsFocus(state: TuiState): boolean {
  return state.pagerOverlay !== "none";
}

export function composerOwnsFocus(state: TuiState): boolean {
  return !pickerSurfaceOwnsFocus(state) &&
    !pagerOverlayOwnsFocus(state) &&
    !bottomPaneBlocksComposerInput(state);
}

export function setTurnStatus(
  state: TuiState,
  turnStatus: TurnStatus,
  statusMessage?: string,
): TuiState {
  return {
    ...state,
    bottomPane: { ...state.bottomPane, turnStatus, statusMessage },
  };
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

export function moveStatusLineSelection(state: TuiState, total: number, delta: number): TuiState {
  if (total <= 0) return { ...state, statusLineSelection: 0 };
  return {
    ...state,
    statusLineSelection: clamp(state.statusLineSelection + delta, 0, total - 1),
  };
}

export function syncStatusLineSelection(state: TuiState, total: number): TuiState {
  if (total <= 0) return { ...state, statusLineSelection: 0 };
  return { ...state, statusLineSelection: clamp(state.statusLineSelection, 0, total - 1) };
}

export function toggleStatusLineItem(state: TuiState, item: StatusLineItemId): TuiState {
  const isEnabled = state.statusLineItems.includes(item);
  return {
    ...state,
    statusLineItems: isEnabled
      ? state.statusLineItems.filter((current) => current !== item)
      : [...state.statusLineItems, item],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
