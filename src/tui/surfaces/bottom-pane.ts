import type { JSONRPCRequest } from "../../codex/app-server";
import type { SlashCommandSpec } from "../commands";
import type { OverlayRowView } from "../core/overlay-model";
import type { TuiState } from "../core/state";
import type { TuiTheme } from "../theme";
import {
  buildApprovalPanel,
} from "../widgets/approval-panel";
import {
  boundedBottomPanePanelHeight,
  bottomPanePanelMaxHeight,
  emptyBottomPanePanel,
  type BottomPanePanelKind,
  type BottomPanePanelMode,
  type BottomPanePanelState,
} from "../widgets/bottom-pane";
import { OVERLAY_HINTS } from "../widgets/overlay-hints";
import { selectedRowScrollY, selectableOverlayRow } from "../widgets/overlay-rows";
import {
  buildPendingInputPreview,
  type PendingInputPreviewMessage,
} from "../widgets/pending-input-preview";
import {
  buildSlashCommandRows,
  formatSlashCommandRow,
} from "../widgets/slash-command-popup";
import {
  formatStatusLineRow,
  type StatusLineRow,
} from "../widgets/statusline-picker";
import {
  formatThemeRow,
  type ThemeRow,
} from "../widgets/theme-picker";

export interface BottomPanePanelInput {
  state: TuiState;
  theme: TuiTheme;
  pendingApproval?: JSONRPCRequest;
  queuedMessage?: PendingInputPreviewMessage;
  slashCommands: readonly SlashCommandSpec[];
  themeRows: readonly ThemeRow[];
  statusLineRows: readonly StatusLineRow[];
  statusLinePreview: string;
  rendererWidth: number;
  rendererHeight: number;
}

export function buildBottomPanePanel(input: BottomPanePanelInput): BottomPanePanelState {
  const width = Math.max(1, input.rendererWidth - 4);

  if (input.pendingApproval) {
    const approval = buildApprovalPanel(
      input.pendingApproval,
      input.state.approvalSelection,
      width,
    );
    return panelFromRows({
      kind: "approval",
      mode: "active",
      rows: approval.lines.map((line, index) => ({
        id: `approval-${index}`,
        content: line,
        foregroundColor: approvalLineColor(index, approval.selectedLineIndex, input.theme),
        backgroundColor: index === approval.selectedLineIndex
          ? input.theme.colors.overlayRowSelected
          : input.theme.colors.background,
      })),
      selectedIndex: approval.selectedLineIndex,
      rendererHeight: input.rendererHeight,
      theme: input.theme,
    });
  }

  switch (input.state.bottomPane.activeView) {
    case "commandPopup": {
      const rows = buildSlashCommandRows(
        input.slashCommands,
        input.state.slashSelection,
      );
      return panelFromRows({
        kind: "commandPopup",
        mode: "active",
        rows: rows.length > 0
          ? rows.map((row, index) => selectableOverlayRow({
            id: row.name,
            content: formatSlashCommandRow(row),
            index,
            isSelected: row.isSelected,
          }, input.theme))
          : [{
            id: "slash-empty",
            content: "No matching commands",
            foregroundColor: input.theme.colors.placeholder,
            backgroundColor: input.theme.colors.background,
          }],
        selectedIndex: rows.length > 0 ? input.state.slashSelection : -1,
        footer: OVERLAY_HINTS.slash,
        rendererHeight: input.rendererHeight,
        theme: input.theme,
      });
    }
    case "themePicker":
      return panelFromRows({
        kind: "themePicker",
        mode: "active",
        rows: input.themeRows.map((row, index) => selectableOverlayRow({
          id: row.name,
          content: formatThemeRow(row),
          index,
          isSelected: row.isSelected,
        }, input.theme)),
        selectedIndex: input.state.themeSelection,
        footer: OVERLAY_HINTS.theme,
        rendererHeight: input.rendererHeight,
        theme: input.theme,
      });
    case "statuslinePicker":
      return panelFromRows({
        kind: "statuslinePicker",
        mode: "active",
        rows: [
          ...input.statusLineRows.map((row, index) => selectableOverlayRow({
            id: row.id,
            content: formatStatusLineRow(row),
            index,
            isSelected: row.isSelected,
          }, input.theme)),
          {
            id: "statusline-preview-gap",
            content: "",
            backgroundColor: input.theme.colors.background,
          },
          {
            id: "statusline-preview",
            content: `Preview  ${input.statusLinePreview || "(empty)"}`,
            foregroundColor: input.theme.colors.muted,
            backgroundColor: input.theme.colors.background,
          },
        ],
        selectedIndex: input.state.statusLineSelection,
        footer: OVERLAY_HINTS.statusline,
        rendererHeight: input.rendererHeight,
        theme: input.theme,
      });
    case "approval":
      return emptyBottomPanePanel();
    case "none":
      break;
  }

  const queuedPreview = buildPendingInputPreview(input.queuedMessage, width);
  if (queuedPreview.visible) {
    return panelFromRows({
      kind: "queuedInput",
      mode: "passive",
      rows: queuedPreview.lines.map((line, index) => ({
        id: `queued-input-${index}`,
        content: line,
        foregroundColor: index === 0 ? input.theme.colors.muted : input.theme.colors.placeholder,
        backgroundColor: input.theme.colors.background,
      })),
      selectedIndex: -1,
      rendererHeight: input.rendererHeight,
      theme: input.theme,
    });
  }

  return emptyBottomPanePanel();
}

function panelFromRows(input: {
  kind: Exclude<BottomPanePanelKind, "none">;
  mode: BottomPanePanelMode;
  rows: readonly OverlayRowView[];
  selectedIndex: number;
  footer?: string;
  rendererHeight: number;
  theme: TuiTheme;
}): BottomPanePanelState {
  const footerHeight = input.footer ? 1 : 0;
  const rowHeight = input.rows.reduce((height, row) => height + (row.height || 1), 0);
  const height = boundedBottomPanePanelHeight(rowHeight + footerHeight, input.rendererHeight);
  const bodyHeight = Math.max(1, height - footerHeight);
  return {
    visible: height > 0,
    mode: input.mode,
    kind: input.kind,
    rows: input.rows,
    content: "",
    selectedIndex: input.selectedIndex,
    scrollY: selectedRowScrollY(input.selectedIndex, bodyHeight),
    height,
    footer: input.footer,
  };
}

function approvalLineColor(index: number, selectedIndex: number, theme: TuiTheme): string {
  if (index === selectedIndex) return theme.colors.textStrong;
  if (index === 0) return theme.colors.muted;
  return theme.colors.placeholder;
}

export function bottomPanePickerViewportHeight(rendererHeight: number): number {
  return Math.max(1, bottomPanePanelMaxHeight(rendererHeight) - 1);
}
