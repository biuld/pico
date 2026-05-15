import type { CodexAppServerClient, JSONRPCRequest } from "../codex/app-server";
import type { PicoThreadStore, RawResponseItem, TurnOverrides } from "../thread/store";

export interface AppState {
  store: PicoThreadStore;
  codex: CodexAppServerClient;
  cwd: string;
}

export interface DraftAppState {
  store?: PicoThreadStore;
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

export interface RunTurnOptions {
  askApproval?: (request: JSONRPCRequest) => Promise<unknown>;
  overrides?: TurnOverrides;
  emit?: ControllerEventSink;
}

export interface AssistantDeltaEvent {
  threadId: string;
  turnId?: string;
  delta: string;
}

export interface RawItemEvent {
  threadId: string;
  turnId: string;
  item: RawResponseItem;
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

export type ControllerEventSink = (event: string, payload: unknown) => void;
