import type { JSONRPCRequest } from "../../codex/app-server";
import type { OverlayView } from "../overlay-model";
import type { TuiTheme } from "../theme";
import { OVERLAY_HINTS } from "./overlay-hints";
import { selectableOverlayRow, selectedRowScrollY } from "./overlay-rows";

export type ApprovalDecision = "accept" | "acceptForSession" | "decline";

export interface ApprovalOption {
  decision: ApprovalDecision;
  shortcut: string;
  label: string;
  description: string;
  isSelected: boolean;
}

export function buildApprovalOverlayView(
  request: JSONRPCRequest,
  selectedIndex: number,
  theme: TuiTheme,
  viewportHeight: number,
): OverlayView {
  const options = buildApprovalOptions(request.method, selectedIndex);
  return {
    visible: true,
    title: "Approval",
    fullScreen: false,
    scrollY: 0,
    content: "",
    rows: [
      {
        id: "approval-request",
        content: `Request: ${request.method}`,
        foregroundColor: theme.colors.muted,
        backgroundColor: theme.colors.overlayRow,
      },
      ...options.map((option, index) => selectableOverlayRow({
        id: option.decision,
        content: formatApprovalOption(option),
        index: index + 1,
        isSelected: option.isSelected,
      }, theme)),
    ],
    rowScrollY: selectedRowScrollY(selectedIndex + 1, viewportHeight),
    footer: OVERLAY_HINTS.approval,
  };
}

export function buildApprovalOptions(method: string, selectedIndex: number): ApprovalOption[] {
  const permissionRequest = method === "item/permissions/requestApproval";
  const labels: Omit<ApprovalOption, "isSelected">[] = permissionRequest
    ? [
        {
          decision: "accept",
          shortcut: "a",
          label: "Approve",
          description: "grant this request",
        },
        {
          decision: "decline",
          shortcut: "d",
          label: "Deny",
          description: "reject this request",
        },
      ]
    : [
        {
          decision: "accept",
          shortcut: "a",
          label: "Approve once",
          description: "allow this operation",
        },
        {
          decision: "acceptForSession",
          shortcut: "s",
          label: "Approve for session",
          description: "allow matching operations this session",
        },
        {
          decision: "decline",
          shortcut: "d",
          label: "Deny",
          description: "reject this operation",
        },
      ];

  return labels.map((option, index) => ({ ...option, isSelected: index === selectedIndex }));
}

export function formatApprovalOption(option: ApprovalOption): string {
  return `[${option.shortcut}] ${option.label}  ${option.description}`;
}
