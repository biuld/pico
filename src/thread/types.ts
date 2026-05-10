import type { ResponseItem as CodexGeneratedResponseItem } from "@pico/codex-app-server-protocol";

export type PicoConfigSnapshot = Record<string, unknown>;

export type CodexResponseItem = CodexGeneratedResponseItem;

// Pico persists raw JSON exactly as received from app-server. The generated
// union documents known Codex shapes, while the object branch keeps JSONL
// tolerant of older tests, forward-compatible payloads, and unmodeled fields.
export type RawResponseItem = Record<string, unknown> & (
  | { type?: string }
  | CodexGeneratedResponseItem
);

export type ResponseItem = RawResponseItem;

export interface PicoThreadHeader {
  type: "thread";
  version: 1;
  id: string;
  createdAt: string;
  cwd: string;
  config: PicoConfigSnapshot;
}

export interface BaseEntry {
  id: string;
  parentId: string | null;
  timestamp: string;
}

export interface TurnEntry extends BaseEntry {
  type: "turn";
  userInput: string;
  cwd: string;
  overrides?: TurnOverrides;
  status: "started" | "completed" | "failed" | "aborted";
  startedAt: string;
}

export interface ResponseItemEntry extends BaseEntry {
  type: "response_item";
  turnId: string;
  responseItem: RawResponseItem;
}

export interface TurnCompletedEntry extends BaseEntry {
  type: "turn_completed";
  turnId: string;
  status: "completed";
  completedAt: string;
  result?: unknown;
}

export interface TurnFailedEntry extends BaseEntry {
  type: "turn_failed";
  turnId: string;
  status: "failed";
  failedAt: string;
  error: string;
}

export interface TurnAbortedEntry extends BaseEntry {
  type: "turn_aborted";
  turnId: string;
  status: "aborted";
  abortedAt: string;
  reason?: string;
}

export interface LabelEntry extends BaseEntry {
  type: "label";
  targetId: string;
  label: string;
}

export interface BranchEntry extends BaseEntry {
  type: "branch";
  targetId: string;
  name?: string;
}

export interface ConfigChangeEntry extends BaseEntry {
  type: "config_change";
  config: PicoConfigSnapshot;
}

export type PicoThreadEntry =
  | TurnEntry
  | ResponseItemEntry
  | TurnCompletedEntry
  | TurnFailedEntry
  | TurnAbortedEntry
  | LabelEntry
  | BranchEntry
  | ConfigChangeEntry;

export interface TurnOverrides {
  model?: string;
  modelProvider?: string;
  approvalPolicy?: string;
  sandbox?: unknown;
  cwd?: string;
  personality?: string;
  developerInstructions?: string;
}

export interface PicoThreadInfo {
  id: string;
  leafId: string;
  cwd: string;
  createdAt: string;
  updatedAt: string;
  preview: string;
  turnCount: number;
  responseItemCount: number;
  label?: string;
}
