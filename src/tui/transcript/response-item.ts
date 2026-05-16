import type { ResponseItem } from "../../thread/store";
import { responseItemText, shouldDisplayResponseItem } from "../response-items";
import {
  formatCommandOutputSummary,
  formatStructuredPreview,
  formatToolArgumentSummary,
  formatToolOutputSummary,
  isApplyPatchTool,
  normalizeJsonLike,
  patchTextFromValue,
  summarizeFileChange,
} from "./decorate";
import {
  assistantMarkdownCell,
  commandCell,
  fileChangeCell,
  planUpdateCell,
  reasoningCell,
  toolCallCell,
  toolOutputCell,
  type TranscriptPlanBlock,
  type TranscriptPlanStepStatus,
  type TranscriptCell,
} from "./cell";

export function transcriptCellsForResponseItem(
  id: string,
  item: ResponseItem,
): TranscriptCell[] {
  if (!shouldDisplayResponseItem(item)) return [];

  const type = normalizedItemType(item);
  const role = typeof item.role === "string" ? item.role : undefined;
  const fallbackText = responseItemText(item) || deepText(item);

  if (role === "assistant" || type === "message") {
    return fallbackText ? [assistantMarkdownCell(id, fallbackText)] : [];
  }

  if (type.includes("reasoning")) {
    const text = deepText(item.summary) || deepText(item.content) || fallbackText;
    return text ? [reasoningCell(id, text)] : [];
  }

  const planUpdate = planUpdatePayload(item);
  if (planUpdate && (type.includes("plan") || isUpdatePlanToolCall(item))) {
    return [planUpdateCell(id, planUpdate, statusText(item))];
  }

  if (type.includes("plan")) {
    return fallbackText ? [assistantMarkdownCell(id, fallbackText)] : [];
  }

  if (type.includes("compaction")) return [];

  if (isToolOutputType(type)) {
    const projectedOutput = toolOutputPreview(item);
    const body = projectedOutput !== undefined ? projectedOutput : fallbackText || previewValue(item.output);
    return body ? [toolOutputCell(id, body, statusText(item), callId(item))] : [];
  }

  if (isCommandType(type, item)) {
    const command = commandPreview(item) || fallbackText;
    if (!command) return [];
    const output = commandOutputPreview(item);
    return [commandCell(id, command, output || undefined, statusText(item), callId(item))];
  }

  if (isFileChangeType(type, item)) {
    const path = firstString(item, ["path", "file", "filename"]);
    const diff = firstString(item, ["patch", "diff"]) || deepText(item.content) || fallbackText;
    return [fileChangeCell(id, {
      path,
      summary: summarizeFileChange(diff),
      diff: diff || undefined,
    })];
  }

  if (isToolCallType(type, item)) {
    const name = toolName(item);
    const label = name || "tool";
    const diff = isApplyPatchTool(name)
      ? patchTextFromValue(argumentValue(item)) || undefined
      : undefined;
    return [toolCallCell(id, label, argumentPreview(item) || undefined, statusText(item), callId(item), diff)];
  }

  return fallbackText ? [assistantMarkdownCell(id, fallbackText)] : [];
}

function normalizedItemType(item: ResponseItem): string {
  const value = firstString(item, ["type", "kind", "itemType"]);
  return value ? value.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase() : "";
}

function isToolCallType(type: string, item: ResponseItem): boolean {
  return (
    type.includes("function_call") ||
    type.includes("tool_call") ||
    type.includes("tool_search_call") ||
    type.includes("mcp_call") ||
    type.includes("web_search") ||
    type.includes("image_generation") ||
    Boolean(toolName(item))
  );
}

function isToolOutputType(type: string): boolean {
  return (
    type.includes("function_call_output") ||
    type.includes("tool_call_output") ||
    type.includes("tool_search_output") ||
    type.includes("tool_output") ||
    type.includes("custom_tool_call_output")
  );
}

function isCommandType(type: string, item: ResponseItem): boolean {
  return (
    type.includes("command") ||
    type.includes("shell") ||
    Boolean(firstString(item, ["command", "cmd"])) ||
    (isShellToolCall(item) && Boolean(commandPreview(item)))
  );
}

function isFileChangeType(type: string, item: ResponseItem): boolean {
  return (
    type.includes("file_change") ||
    type.includes("patch") ||
    type.includes("diff") ||
    typeof item.patch === "string" ||
    typeof item.diff === "string"
  );
}

function toolName(item: ResponseItem): string | undefined {
  const direct = firstString(item, ["name", "toolName", "tool_name"]);
  if (direct) return direct;
  if (isRecord(item.tool)) return firstString(item.tool, ["name", "toolName", "server"]);
  if (isRecord(item.mcp)) return firstString(item.mcp, ["name", "server", "tool"]);
  return undefined;
}

function isUpdatePlanToolCall(item: ResponseItem): boolean {
  const name = toolName(item)?.toLowerCase();
  return name === "update_plan" || name?.endsWith(".update_plan") || false;
}

function planUpdatePayload(item: ResponseItem): TranscriptPlanBlock["payload"] | undefined {
  const source = planPayloadSource(item);
  if (!source) return undefined;

  const rawPlan = source.plan ?? source.steps ?? source.items;
  if (!Array.isArray(rawPlan)) return undefined;

  const steps = rawPlan
    .map(planStep)
    .filter((step): step is NonNullable<ReturnType<typeof planStep>> => Boolean(step));
  const explanation = firstString(source, ["explanation", "note", "message"]);
  return {
    ...(explanation ? { explanation } : {}),
    steps,
  };
}

function planPayloadSource(item: ResponseItem): Record<string, unknown> | undefined {
  const candidates = [
    item,
    argumentValue(item),
    item.input,
    item.params,
    item.output,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeJsonLike(candidate);
    if (isRecord(normalized) && Array.isArray(normalized.plan ?? normalized.steps ?? normalized.items)) {
      return normalized;
    }
  }
  return undefined;
}

function planStep(value: unknown): { step: string; status: TranscriptPlanStepStatus } | undefined {
  const normalized = normalizeJsonLike(value);
  if (typeof normalized === "string") {
    const step = normalized.trim();
    return step ? { step, status: "pending" } : undefined;
  }
  if (!isRecord(normalized)) return undefined;

  const step = firstString(normalized, ["step", "text", "title", "description"])?.trim();
  if (!step) return undefined;
  return {
    step,
    status: normalizePlanStatus(firstString(normalized, ["status", "state"])),
  };
}

function normalizePlanStatus(status: string | undefined): TranscriptPlanStepStatus {
  const normalized = status?.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  if (normalized === "completed" || normalized === "done" || normalized === "complete") {
    return "completed";
  }
  if (normalized === "in_progress" || normalized === "active" || normalized === "running") {
    return "in_progress";
  }
  return "pending";
}

function argumentPreview(item: ResponseItem): string {
  const value = argumentValue(item);
  return formatToolArgumentSummary(toolName(item), value);
}

function toolOutputPreview(item: ResponseItem): string | undefined {
  if (item.output !== undefined) return formatToolOutputSummary(item.output);
  if (item.content !== undefined) return formatToolOutputSummary(item.content);
  return undefined;
}

function commandOutputPreview(item: ResponseItem): string {
  if (item.output !== undefined) return formatCommandOutputSummary(item.output);
  if (item.content !== undefined) return formatCommandOutputSummary(item.content);
  return "";
}

function commandPreview(item: ResponseItem): string {
  const direct = firstString(item, ["command", "cmd"]);
  if (direct) return direct;

  const action = isRecord(item.action) ? item.action : undefined;
  const actionCommand = action ? firstString(action, ["command", "cmd"]) : undefined;
  if (actionCommand) return actionCommand;

  const commandValue = isRecord(item.command) ? item.command : undefined;
  const nestedCommand = commandValue ? firstString(commandValue, ["command", "cmd", "line"]) : undefined;
  if (nestedCommand) return nestedCommand;

  const args = argumentValue(item);
  if (isRecord(args)) return firstString(args, ["command", "cmd", "line", "script"]) || "";
  return "";
}

function statusText(item: ResponseItem): string | undefined {
  return firstString(item, ["status", "state"]);
}

function callId(item: ResponseItem): string | undefined {
  return firstString(item, ["call_id", "callId"]);
}

function deepText(value: unknown): string {
  return collectText(value).join("").trim();
}

function collectText(value: unknown, depth = 0): string[] {
  if (depth > 6 || value === null || value === undefined) return [];
  if (typeof value === "string") return value ? [value] : [];
  if (typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectText(item, depth + 1));

  const record = value as Record<string, unknown>;
  const direct = firstString(record, ["text", "output_text", "content", "summary", "message", "body"]);
  if (direct) return [direct];

  return ["summary", "content", "output", "body", "result", "items"].flatMap((key) => (
    collectText(record[key], depth + 1)
  ));
}

function firstString(
  item: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function previewValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  return formatStructuredPreview(value);
}

function argumentValue(item: ResponseItem): unknown {
  const value = item.arguments ?? item.args ?? item.input ?? item.params;
  return normalizeJsonLike(value);
}

function isShellToolCall(item: ResponseItem): boolean {
  const name = toolName(item)?.toLowerCase();
  return Boolean(
    name === "exec_command" ||
    name === "shell.exec" ||
    name === "shell_exec" ||
    name === "local_shell" ||
    name?.endsWith(".exec_command") ||
    name?.endsWith(".shell_exec"),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
