import type {
  AssistantDeltaEvent,
  DraftAppState,
  RawItemEvent,
  TurnAbortedEvent,
  TurnCompletedEvent,
  TurnFailedEvent,
  TurnStartedEvent,
} from "../app/controller";
import type { CodexStatusSnapshot, JSONRPCRequest } from "../codex/app-server";
import type { PicoConfig } from "../config";
import type { BranchEntry, LabelEntry } from "../thread/store";

export const PICO_APP_SESSION_EVENTS = {
  APP_CHANGED: "app:changed",
  CONFIG_CHANGED: "config:changed",
  CODEX_STATUS: "codex:status",
  THREAD_BRANCHED: "thread:branched",
  THREAD_LABELED: "thread:labeled",
  THREAD_LOADED: "thread:loaded",
  TURN_BUSY: "turn:busy",
  TURN_SUBMITTING: "turn:submitting",
  TURN_THREAD_READY: "turn:thread-ready",
  TURN_STARTED: "turn:started",
  TURN_CODEX_STARTED: "turn:codex-started",
  TURN_INTERRUPT_REQUESTED: "turn:interrupt-requested",
  TURN_INTERRUPT_FAILED: "turn:interrupt-failed",
  ASSISTANT_DELTA: "assistant:delta",
  RAW_ITEM_COMPLETED: "raw-item:completed",
  TURN_COMPLETED: "turn:completed",
  TURN_ABORTED: "turn:aborted",
  TURN_FAILED: "turn:failed",
  TURN_FINISHED: "turn:finished",
  APPROVAL_REQUESTED: "approval:requested",
  APPROVAL_RESOLVED: "approval:resolved",
  QUEUE_CHANGED: "queue:changed",
  DRAFT_RESET: "draft:reset",
} as const;

export type PicoAppSessionEventName =
  typeof PICO_APP_SESSION_EVENTS[keyof typeof PICO_APP_SESSION_EVENTS];

export interface PicoAppSessionEventPayloads {
  [PICO_APP_SESSION_EVENTS.APP_CHANGED]: DraftAppState;
  [PICO_APP_SESSION_EVENTS.CONFIG_CHANGED]: PicoConfig;
  [PICO_APP_SESSION_EVENTS.CODEX_STATUS]: CodexStatusSnapshot;
  [PICO_APP_SESSION_EVENTS.THREAD_BRANCHED]: BranchEntry;
  [PICO_APP_SESSION_EVENTS.THREAD_LABELED]: LabelEntry;
  [PICO_APP_SESSION_EVENTS.THREAD_LOADED]: { threadId: string };
  [PICO_APP_SESSION_EVENTS.TURN_BUSY]: void;
  [PICO_APP_SESSION_EVENTS.TURN_SUBMITTING]: void;
  [PICO_APP_SESSION_EVENTS.TURN_THREAD_READY]: { leafId: string };
  [PICO_APP_SESSION_EVENTS.TURN_STARTED]: TurnStartedEvent;
  [PICO_APP_SESSION_EVENTS.TURN_CODEX_STARTED]: TurnStartedEvent;
  [PICO_APP_SESSION_EVENTS.TURN_INTERRUPT_REQUESTED]: {
    threadId?: string;
    codexTurnId?: string;
    pending: boolean;
  };
  [PICO_APP_SESSION_EVENTS.TURN_INTERRUPT_FAILED]: { error: Error | string };
  [PICO_APP_SESSION_EVENTS.ASSISTANT_DELTA]: AssistantDeltaEvent;
  [PICO_APP_SESSION_EVENTS.RAW_ITEM_COMPLETED]: RawItemEvent;
  [PICO_APP_SESSION_EVENTS.TURN_COMPLETED]: TurnCompletedEvent;
  [PICO_APP_SESSION_EVENTS.TURN_ABORTED]: TurnAbortedEvent;
  [PICO_APP_SESSION_EVENTS.TURN_FAILED]: TurnFailedEvent;
  [PICO_APP_SESSION_EVENTS.TURN_FINISHED]: void;
  [PICO_APP_SESSION_EVENTS.APPROVAL_REQUESTED]: JSONRPCRequest;
  [PICO_APP_SESSION_EVENTS.APPROVAL_RESOLVED]: { running: boolean };
  [PICO_APP_SESSION_EVENTS.QUEUE_CHANGED]: { queuedCount: number };
  [PICO_APP_SESSION_EVENTS.DRAFT_RESET]: { reason: "new" | "clear" };
}

export type PicoAppSessionEventArgs<Name extends PicoAppSessionEventName> =
  PicoAppSessionEventPayloads[Name] extends void
    ? []
    : [PicoAppSessionEventPayloads[Name]];
