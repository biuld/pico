import type { CodexAppServerClient, JSONRPCRequest } from "../codex/app-server";
import type { ThreadItem } from "@pico/codex-app-server-protocol/v2";
import type { CodexThreadState, ResponseItem, TurnOverrides } from "./codex-thread-state";

export interface AppState {
  store: CodexThreadState;
  codex: CodexAppServerClient;
  cwd: string;
}

export interface DraftAppState {
  store?: CodexThreadState;
  codex: CodexAppServerClient;
  cwd: string;
}

export interface TurnResult {
  turnId: string;
  codexTurnId: string;
  status: "completed" | "aborted";
  rawItemCount: number;
  leafId: string;
  completed: unknown;
}

export interface TurnObserver {
  onThreadChanged?(event: { type: string; leafId: string; [key: string]: unknown }): void;
  onTurnStarted?(event: TurnStartedEvent): void;
  onCodexTurnStarted?(event: TurnStartedEvent): void;
  onAssistantDelta?(event: AssistantDeltaEvent): void;
  onRawItemCompleted?(event: RawItemEvent): void;
  onTurnCompleted?(event: TurnCompletedEvent): void;
  onTurnAborted?(event: TurnAbortedEvent): void;
  onTurnFailed?(event: TurnFailedEvent): void;
  onApprovalRequested?(request: JSONRPCRequest): void;
  onApprovalResolved?(event: { request: JSONRPCRequest; result: unknown }): void;
  onApprovalRejected?(event: { request: JSONRPCRequest; error: string }): void;
  onThreadItemCompleted?(item: ThreadItem): void;
}

export interface RunTurnOptions {
  askApproval?: (request: JSONRPCRequest) => Promise<unknown>;
  overrides?: TurnOverrides;
  observer?: TurnObserver;
}

export interface AssistantDeltaEvent {
  threadId: string;
  turnId?: string;
  delta: string;
}

export interface RawItemEvent {
  threadId: string;
  turnId: string;
  item: ResponseItem;
  entryId?: string;
}

export interface TurnStartedEvent {
  threadId: string;
  turnId: string;
  codexTurnId?: string;
  userInput: string;
  threadStatus?: string;
  model?: string;
  modelProvider?: string;
}

export interface TurnCompletedEvent extends TurnResult {
  threadId: string;
  status: "completed";
}

export interface TurnAbortedEvent extends TurnResult {
  threadId: string;
  status: "aborted";
  reason: string;
}

export interface TurnFailedEvent {
  threadId?: string;
  turnId?: string;
  error: Error | string;
}

