/** @jsxImportSource @opentui/solid */
import { For } from "solid-js";
import { normalizeServerRequest, type CodexApprovalRequestedEvent, type ApprovalRequestKind } from "../../../codex/app-server";
import type { JSONRPCRequest } from "../../../codex/app-server";
import type { TuiTheme } from "../../theme";
import { SolidText } from "../solid-text";

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
  selectedLineIndex: number;
}

const APPROVAL_PANEL_HINT = "  Enter choose · Esc deny · Up/Down move · type to queue";

export function emptyApprovalPanel(): ApprovalPanelState {
  return {
    visible: false,
    lines: [],
    height: 0,
    selectedLineIndex: -1,
  };
}

export function buildApprovalPanel(
  request: JSONRPCRequest | undefined,
  selectedIndex: number,
  width = 80,
  queueCount = 1,
): ApprovalPanelState {
  if (!request) return emptyApprovalPanel();

  const event = normalizeServerRequest(request);
  const detailLines = approvalDetailLines(event, Math.max(12, width - 4));
  const queueHeader = queueCount > 1 ? [`  [${queueCount} pending approvals]`] : [];
  const lines = [
    ...queueHeader,
    ...detailLines,
    ...buildApprovalOptions(event.kind, selectedIndex).map((option) =>
      `  ${formatApprovalOption(option)}`
    ),
    APPROVAL_PANEL_HINT,
  ];

  return {
    visible: true,
    lines,
    height: lines.length,
    selectedLineIndex: queueHeader.length + detailLines.length + selectedIndex,
  };
}

export function ApprovalPanelView(props: {
  panel: ApprovalPanelState;
  theme: TuiTheme;
}) {
  return (
    <box
      id="pico-approval-panel"
      flexDirection="row"
      width="100%"
      height={props.panel.height}
      visible={props.panel.visible}
      paddingX={0}
      paddingY={0}
      backgroundColor={props.theme.colors.background}
    >
      <box
        id="pico-approval-panel-gutter"
        width={1}
        height="100%"
        backgroundColor={props.theme.colors.status}
      />
      <box
        id="pico-approval-panel-lines"
        flexDirection="column"
        flexGrow={1}
        height="100%"
        backgroundColor={props.theme.colors.background}
      >
        <For each={props.panel.lines}>
          {(line, index) => {
            const isSelected = () => index() === props.panel.selectedLineIndex;
            return (
              <SolidText
                id={`pico-approval-panel-line-${index()}`}
                width="100%"
                height={1}
                content={line}
                fg={approvalLineColor(index(), isSelected(), props.theme)}
                bg={isSelected() ? props.theme.colors.overlayRowSelected : undefined}
                wrapMode="none"
                truncate={true}
              />
            );
          }}
        </For>
      </box>
    </box>
  );
}

export function buildApprovalOptions(kind: ApprovalRequestKind, selectedIndex: number): ApprovalOption[] {
  const isPermissions = kind === "permissions";
  const labels: Omit<ApprovalOption, "isSelected">[] = isPermissions
    ? [
        { decision: "accept", shortcut: "a", label: "Yes, grant permissions", description: "" },
        { decision: "decline", shortcut: "d", label: "No, deny request", description: "" },
      ]
    : [
        { decision: "accept", shortcut: "a", label: "Yes, proceed", description: "" },
        { decision: "acceptForSession", shortcut: "s", label: "Yes, don't ask again this session", description: "" },
        { decision: "decline", shortcut: "d", label: "No, tell Codex what to do differently", description: "" },
      ];

  return labels.map((option, index) => ({ ...option, isSelected: index === selectedIndex }));
}

export function formatApprovalOption(option: ApprovalOption): string {
  return option.description ? `${option.label}  ${option.description}` : option.label;
}

function approvalLineColor(index: number, isSelected: boolean, theme: TuiTheme): string {
  if (isSelected) return theme.colors.textStrong;
  if (index === 0) return theme.colors.muted;
  return theme.colors.placeholder;
}

function approvalDetailLines(event: CodexApprovalRequestedEvent, width: number): string[] {
  const lines: string[] = [];
  const kindLabel = approvalKindLabel(event.kind);
  if (kindLabel) lines.push(`  ${kindLabel}`);
  if (event.reason) lines.push(`  ${truncateInline(event.reason, width)}`);
  if (event.command) lines.push(`  command: ${truncateInline(event.command, width)}`);
  if (event.cwd) lines.push(`  cwd: ${truncateInline(event.cwd, width)}`);
  if (event.filePath) lines.push(`  file: ${truncateInline(event.filePath, width)}`);
  if (event.permissionTool) lines.push(`  tool: ${event.permissionTool}`);
  if (event.mcpServerName) lines.push(`  MCP server: ${event.mcpServerName}`);
  if (event.toolName) lines.push(`  tool: ${event.toolName}`);
  if (event.inputPrompt) lines.push(`  ${truncateInline(event.inputPrompt, width)}`);
  return lines.slice(0, 4);
}

function approvalKindLabel(kind: string): string | undefined {
  switch (kind) {
    case "command": return "Run command";
    case "fileChange": return "File change";
    case "permissions": return "Grant permissions";
    case "mcpElicitation": return "MCP elicitation";
    case "toolUserInput": return "Tool input request";
    case "dynamicToolCall": return "Dynamic tool call";
    default: return undefined;
  }
}

function truncateInline(value: string, width: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= width) return trimmed;
  return `${trimmed.slice(0, Math.max(1, width - 3))}...`;
}
