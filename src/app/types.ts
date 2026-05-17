import type { CodexAppServerClient, JSONRPCRequest } from "../codex/app-server";
import type { ThreadItem } from "@pico/codex-app-server-protocol/v2";
import type { CodexThreadViewState, TurnOverrides } from "./codex-thread-view-state";

export interface AppState {
  viewState: CodexThreadViewState;
  codex: CodexAppServerClient;
  cwd: string;
}

export interface DraftAppState {
  viewState?: CodexThreadViewState;
  codex: CodexAppServerClient;
  cwd: string;
}

export interface TurnResult {
  turnId: string;
  codexTurnId: string;
  status: "completed" | "aborted";
  completed: unknown;
}

export interface TurnObserver {
  onTurnStarted?(event: TurnStartedEvent): void;
  onCodexTurnStarted?(event: TurnStartedEvent): void;
  onAssistantDelta?(event: AssistantDeltaEvent): void;
  onTurnCompleted?(event: TurnCompletedEvent): void;
  onTurnAborted?(event: TurnAbortedEvent): void;
  onTurnFailed?(event: TurnFailedEvent): void;
  onApprovalRequested?(request: JSONRPCRequest): void;
  onApprovalResolved?(event: { request: JSONRPCRequest; result: unknown }): void;
  onApprovalRejected?(event: { request: JSONRPCRequest; error: string }): void;
  onThreadItemCompleted?(item: ThreadItem): void;
  /** Fired for reasoning, command output, file change, and other non-assistant live deltas. */
  onLiveTranscriptChanged?(): void;
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

