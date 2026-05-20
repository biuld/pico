import type { ThreadItem } from "@pico/codex-app-server-protocol/v2";
import type {
  AssistantDeltaEvent,
  DraftAppState,
  TurnAbortedEvent,
  TurnCompletedEvent,
  TurnFailedEvent,
  TurnStartedEvent,
} from "../app/types";
import type { CodexStatusSnapshot, JSONRPCRequest } from "../codex/app-server";

export const PICO_APP_SESSION_EVENTS = {
  APP_CHANGED: "app:changed",
  CODEX_STATUS: "codex:status",
  THREAD_LOADED: "thread:loaded",
  TURN_BUSY: "turn:busy",
  TURN_SUBMITTING: "turn:submitting",
  TURN_THREAD_READY: "turn:thread-ready",
  TURN_STARTED: "turn:started",
  TURN_CODEX_STARTED: "turn:codex-started",
  TURN_INTERRUPT_REQUESTED: "turn:interrupt-requested",
  TURN_INTERRUPT_FAILED: "turn:interrupt-failed",
  ASSISTANT_DELTA: "assistant:delta",
  TURN_COMPLETED: "turn:completed",
  TURN_ABORTED: "turn:aborted",
  TURN_FAILED: "turn:failed",
  TURN_FINISHED: "turn:finished",
  APPROVAL_REQUESTED: "approval:requested",
  APPROVAL_RESOLVED: "approval:resolved",
  QUEUE_CHANGED: "queue:changed",
  DRAFT_RESET: "draft:reset",
  THREAD_ITEM: "thread:item",
  LIVE_TRANSCRIPT_CHANGED: "live:transcript-changed",
} as const;

export type PicoAppSessionEventName =
  typeof PICO_APP_SESSION_EVENTS[keyof typeof PICO_APP_SESSION_EVENTS];

export interface PicoAppSessionEventPayloads {
  [PICO_APP_SESSION_EVENTS.APP_CHANGED]: DraftAppState;
  [PICO_APP_SESSION_EVENTS.CODEX_STATUS]: CodexStatusSnapshot;
  [PICO_APP_SESSION_EVENTS.THREAD_LOADED]: { threadId: string };
  [PICO_APP_SESSION_EVENTS.TURN_BUSY]: void;
  [PICO_APP_SESSION_EVENTS.TURN_SUBMITTING]: void;
  [PICO_APP_SESSION_EVENTS.TURN_THREAD_READY]: { threadId: string };
  [PICO_APP_SESSION_EVENTS.TURN_STARTED]: TurnStartedEvent;
  [PICO_APP_SESSION_EVENTS.TURN_CODEX_STARTED]: TurnStartedEvent;
  [PICO_APP_SESSION_EVENTS.TURN_INTERRUPT_REQUESTED]: {
    threadId?: string;
    codexTurnId?: string;
    pending: boolean;
  };
  [PICO_APP_SESSION_EVENTS.TURN_INTERRUPT_FAILED]: { error: Error | string };
  [PICO_APP_SESSION_EVENTS.ASSISTANT_DELTA]: AssistantDeltaEvent;
  [PICO_APP_SESSION_EVENTS.TURN_COMPLETED]: TurnCompletedEvent;
  [PICO_APP_SESSION_EVENTS.TURN_ABORTED]: TurnAbortedEvent;
  [PICO_APP_SESSION_EVENTS.TURN_FAILED]: TurnFailedEvent;
  [PICO_APP_SESSION_EVENTS.TURN_FINISHED]: void;
  [PICO_APP_SESSION_EVENTS.APPROVAL_REQUESTED]: JSONRPCRequest;
  [PICO_APP_SESSION_EVENTS.APPROVAL_RESOLVED]: { running: boolean; remainingCount: number };
  [PICO_APP_SESSION_EVENTS.QUEUE_CHANGED]: { queuedCount: number };
  [PICO_APP_SESSION_EVENTS.DRAFT_RESET]: { reason: "new" | "clear" };
  [PICO_APP_SESSION_EVENTS.THREAD_ITEM]: ThreadItem;
  [PICO_APP_SESSION_EVENTS.LIVE_TRANSCRIPT_CHANGED]: void;
}

export type PicoAppSessionEventArgs<Name extends PicoAppSessionEventName> =
  PicoAppSessionEventPayloads[Name] extends void
    ? []
    : [PicoAppSessionEventPayloads[Name]];
