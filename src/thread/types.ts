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

export type CodexRolloutItemType = "response_item" | "event_msg" | "compacted";

export type RolloutItem =
  | { type: "response_item"; payload: RawResponseItem }
  | { type: "event_msg"; payload: unknown }
  | { type: "compacted"; payload: unknown }
  | { type: "branch_out" };

export interface RolloutEntry extends BaseEntry {
  item: RolloutItem;
}

export type PicoThreadEntry = RolloutEntry;

export type TurnEntry = RolloutEntry & {
  type?: "turn";
  userInput?: string;
  status?: TurnStatus;
};
export type ResponseItemEntry = RolloutEntry & {
  type?: "response_item";
  responseItem?: RawResponseItem;
  turnId?: string;
};
export type TurnCompletedEntry = RolloutEntry;
export type TurnFailedEntry = RolloutEntry;
export type TurnAbortedEntry = RolloutEntry;
export type BranchEntry = RolloutEntry & { targetId?: string; name?: string };
export type LabelEntry = RolloutEntry & { targetId?: string; label?: string };
export type ConfigChangeEntry = RolloutEntry;

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

export type TurnStatus = "started" | "completed" | "failed" | "aborted";

export interface UserInputResponseItem extends RawResponseItem {
  id: string;
  type: "message";
  role: "user";
  content: Array<{ type: "input_text"; text: string }>;
  pico?: { kind: "user_input"; status?: TurnStatus; overrides?: TurnOverrides; cwd?: string };
}
