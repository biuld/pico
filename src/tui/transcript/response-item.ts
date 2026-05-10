import type { ResponseItem } from "../../session/store";
import { responseItemText, shouldDisplayResponseItem } from "../response-items";
import type { TranscriptRow, TranscriptRowKind } from "./model";

export function transcriptRowsForResponseItem(
  id: string,
  item: ResponseItem,
): TranscriptRow[] {
  if (!shouldDisplayResponseItem(item)) return [];

  const type = normalizedItemType(item);
  const role = typeof item.role === "string" ? item.role : undefined;
  const fallbackText = responseItemText(item) || deepText(item);

  if (role === "assistant" || type === "message") {
    return fallbackText ? [assistantRow(id, fallbackText)] : [];
  }

  if (type.includes("reasoning")) {
    return semanticRow(id, "reasoning", reasoningText(item, fallbackText));
  }

  if (type.includes("plan")) {
    return semanticRow(id, "plan", prefixText("plan", fallbackText));
  }

  if (isToolOutputType(type)) {
    return semanticRow(id, "tool", toolOutputText(item, fallbackText));
  }

  if (isCommandType(type, item)) {
    return semanticRow(id, "command", commandText(item, fallbackText));
  }

  if (isFileChangeType(type, item)) {
    return semanticRow(id, "file", fileChangeText(item, fallbackText));
  }

  if (isToolCallType(type, item)) {
    return semanticRow(id, "tool", toolCallText(item, fallbackText));
  }

  return fallbackText ? [assistantRow(id, fallbackText)] : [];
}

function assistantRow(id: string, text: string): TranscriptRow {
  return { id, role: "assistant", text };
}

function semanticRow(
  id: string,
  kind: TranscriptRowKind,
  text: string,
): TranscriptRow[] {
  return text ? [{ id, role: "assistant", kind, text }] : [];
}

function normalizedItemType(item: ResponseItem): string {
  const value = firstString(item, ["type", "kind", "itemType"]);
  return value ? value.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase() : "";
}

function reasoningText(item: ResponseItem, fallbackText: string): string {
  const text = deepText(item.summary) || deepText(item.content) || fallbackText;
  return prefixText("reasoning", text);
}

function toolCallText(item: ResponseItem, fallbackText: string): string {
  const name = toolName(item);
  const args = argumentPreview(item);
  const label = name ? `tool call: ${name}` : "tool call";
  if (args) return `${label} ${args}`;
  return prefixText(label, fallbackText);
}

function toolOutputText(item: ResponseItem, fallbackText: string): string {
  const text = deepText(item.output) || deepText(item.content) || fallbackText || previewValue(item.output);
  const callId = firstString(item, ["call_id", "callId"]);
  const label = callId ? `tool output ${callId}` : "tool output";
  return prefixText(label, text);
}

function commandText(item: ResponseItem, fallbackText: string): string {
  const command = commandPreview(item);
  const output = deepText(item.output) || deepText(item.content);
  if (command && output) return `command: ${command}\n${output}`;
  if (command) return `command: ${command}`;
  return prefixText("command", output || fallbackText);
}

function fileChangeText(item: ResponseItem, fallbackText: string): string {
  const path = firstString(item, ["path", "file", "filename"]);
  const patch = firstString(item, ["patch", "diff"]) || deepText(item.content) || fallbackText;
  const label = path ? `file change: ${path}` : "file change";
  return prefixText(label, patch);
}

function isToolCallType(type: string, item: ResponseItem): boolean {
  return (
    type.includes("function_call") ||
    type.includes("tool_call") ||
    type.includes("mcp_call") ||
    Boolean(toolName(item))
  );
}

function isToolOutputType(type: string): boolean {
  return (
    type.includes("function_call_output") ||
    type.includes("tool_call_output") ||
    type.includes("tool_output") ||
    type.includes("custom_tool_call_output")
  );
}

function isCommandType(type: string, item: ResponseItem): boolean {
  return (
    type.includes("command") ||
    type.includes("shell") ||
    Boolean(commandPreview(item))
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

function argumentPreview(item: ResponseItem): string {
  const value = item.arguments ?? item.args ?? item.input ?? item.params;
  return previewValue(value);
}

function commandPreview(item: ResponseItem): string {
  const direct = firstString(item, ["command", "cmd"]);
  if (direct) return direct;

  const action = isRecord(item.action) ? item.action : undefined;
  const actionCommand = action ? firstString(action, ["command", "cmd"]) : undefined;
  if (actionCommand) return actionCommand;

  const commandValue = isRecord(item.command) ? item.command : undefined;
  return commandValue ? firstString(commandValue, ["command", "cmd", "line"]) || "" : "";
}

function prefixText(label: string, text: string): string {
  const normalized = text.trim();
  return normalized ? `${label}: ${normalized}` : label;
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
  if (typeof value === "string") return compact(value);
  try {
    return compact(JSON.stringify(value));
  } catch {
    return "";
  }
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
