import type { ResponseItem } from "@pico/codex-app-server-protocol";

export type PicoConfigSnapshot = Record<string, unknown>;

// === Codex-native RolloutItem format ===

export type RolloutItem =
  | { type: "session_meta"; payload: SessionMeta }
  | { type: "response_item"; payload: ResponseItem };

export interface SessionMeta {
  id: string;
  cwd: string;
  createdAt: string;
  config: PicoConfigSnapshot;
}

// === Pico line format: RolloutLine + tree navigation ===

export interface RolloutLine {
  timestamp: string;
  type: RolloutItem["type"];
  payload: RolloutItem["payload"];
  id: string;
  parent?: string;
}

export interface BranchOut {
  id: string;
  type: "branch_out";
  parent: string;
}

export type PicoLine = RolloutLine | BranchOut | EventLine;

export interface EventLine {
  id: string;
  parent: string;
  timestamp: string;
  type: "event_msg";
  payload: unknown;
}

export const CURRENT_THREAD_VERSION = 3;

// === Thread info (for list view) ===

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

// === Turn overrides ===

export interface TurnOverrides {
  model?: string;
  modelProvider?: string;
  approvalPolicy?: string;
  sandbox?: unknown;
  cwd?: string;
  personality?: string;
  developerInstructions?: string;
}

export type TurnStatus = "started" | "completed" | "failed" | "aborted";

// === User input helper ===

export interface UserInputResponseItem {
  id: string;
  type: "message";
  role: "user";
  content: Array<{ type: "input_text"; text: string }>;
  created_at: string;
  pico?: { kind: "user_input"; status?: TurnStatus; overrides?: TurnOverrides; cwd?: string };
}


