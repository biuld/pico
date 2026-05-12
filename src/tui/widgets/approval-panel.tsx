/** @jsxImportSource @opentui/solid */
import { For } from "solid-js";
import type { JSONRPCRequest } from "../../codex/app-server";
import type { TuiTheme } from "../theme";
import { SolidText } from "./solid-text";

export type ApprovalDecision = "accept" | "acceptForSession" | "decline";

export interface ApprovalOption {
  decision: ApprovalDecision;
  shortcut: string;
  label: string;
  description: string;
  isSelected: boolean;
}

export interface ApprovalPanelState {
  visible: boolean;
  lines: readonly string[];
  height: number;
}

const APPROVAL_PANEL_HINT = "  Enter choose · Esc deny · Up/Down move · type to queue";

export function emptyApprovalPanel(): ApprovalPanelState {
  return {
    visible: false,
    lines: [],
    height: 0,
  };
}

export function buildApprovalPanel(
  request: JSONRPCRequest | undefined,
  selectedIndex: number,
  width = 80,
): ApprovalPanelState {
  if (!request) return emptyApprovalPanel();

  const lines = [
    ...approvalDetailLines(request, Math.max(12, width - 4)),
    ...buildApprovalOptions(request.method, selectedIndex).map((option) =>
      `${option.isSelected ? "›" : " "} ${formatApprovalOption(option)}`
    ),
    APPROVAL_PANEL_HINT,
  ];

  return {
    visible: true,
    lines,
    height: lines.length,
  };
}

export function ApprovalPanelView(props: {
  panel: ApprovalPanelState;
  theme: TuiTheme;
}) {
  return (
    <box
      id="pico-approval-panel"
      flexDirection="column"
      width="100%"
      height={props.panel.height}
      visible={props.panel.visible}
      paddingX={0}
      paddingY={0}
      backgroundColor={props.theme.colors.background}
    >
      <For each={props.panel.lines}>
        {(line, index) => (
          <SolidText
            id={`pico-approval-panel-line-${index()}`}
            width="100%"
            height={1}
            content={line}
            fg={approvalLineColor(line, index(), props.theme)}
            wrapMode="none"
            truncate={true}
          />
        )}
      </For>
    </box>
  );
}

export function buildApprovalOptions(method: string, selectedIndex: number): ApprovalOption[] {
  const permissionRequest = method === "item/permissions/requestApproval";
  const labels: Omit<ApprovalOption, "isSelected">[] = permissionRequest
    ? [
        {
          decision: "accept",
          shortcut: "a",
          label: "Yes, grant permissions",
          description: "",
        },
        {
          decision: "decline",
          shortcut: "d",
          label: "No, deny request",
          description: "",
        },
      ]
    : [
        {
          decision: "accept",
          shortcut: "a",
          label: "Yes, proceed",
          description: "",
        },
        {
          decision: "acceptForSession",
          shortcut: "s",
          label: "Yes, don't ask again this session",
          description: "",
        },
        {
          decision: "decline",
          shortcut: "d",
          label: "No, tell Codex what to do differently",
          description: "",
        },
      ];

  return labels.map((option, index) => ({ ...option, isSelected: index === selectedIndex }));
}

export function formatApprovalOption(option: ApprovalOption): string {
  return option.description ? `${option.label}  ${option.description}` : option.label;
}

function approvalLineColor(line: string, index: number, theme: TuiTheme): string {
  if (line.startsWith("›")) return theme.colors.textStrong;
  if (index === 0) return theme.colors.muted;
  return theme.colors.placeholder;
}

function approvalDetailLines(request: JSONRPCRequest, width: number): string[] {
  const params = objectValue(request.params);
  const lines: string[] = [];
  const command = commandValue(params);
  const reason = stringValue(params, "reason");
  const cwd = stringValue(params, "cwd");

  if (command) lines.push(`  command: ${truncateInline(command, width)}`);
  if (reason) lines.push(`  reason: ${truncateInline(reason, width)}`);
  if (cwd) lines.push(`  cwd: ${truncateInline(cwd, width)}`);

  return lines.slice(0, 3);
}

function commandValue(value: Record<string, unknown>): string | undefined {
  const command = value.command;
  if (typeof command === "string" && command.trim()) return inlineText(command);
  if (Array.isArray(command) && command.every((item) => typeof item === "string")) {
    return inlineText(command.join(" "));
  }

  const argv = value.argv;
  if (Array.isArray(argv) && argv.every((item) => typeof item === "string")) {
    return inlineText(argv.join(" "));
  }

  return undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function stringValue(value: Record<string, unknown>, key: string): string | undefined {
  const item = value[key];
  return typeof item === "string" && item.trim() ? inlineText(item) : undefined;
}

function inlineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateInline(value: string, width: number): string {
  if (value.length <= width) return value;
  return `${value.slice(0, Math.max(1, width - 3))}...`;
}
