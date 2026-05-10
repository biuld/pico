import type { JSONRPCRequest } from "../../codex/types";
import type { OverlayView } from "../overlay-model";

export type ApprovalDecision = "accept" | "session" | "decline";

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
): OverlayView {
  const options = buildApprovalOptions(request.method, selectedIndex);
  return {
    visible: true,
    title: "Approval",
    height: Math.min(10, options.length + 4),
    fullScreen: false,
    scrollY: 0,
    content: [`Request: ${request.method}`, "", ...options.map(formatApprovalOption)].join("\n"),
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
          decision: "session",
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
  const selected = option.isSelected ? ">" : " ";
  return `${selected} [${option.shortcut}] ${option.label}  ${option.description}`;
}
