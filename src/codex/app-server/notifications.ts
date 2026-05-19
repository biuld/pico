import type { JSONRPCNotification, JSONRPCRequest } from "./types";
import type { ThreadItem, FileUpdateChange } from "@pico/codex-app-server-protocol/v2";

// ── Semantic event types ──

export type CodexEvent =
  | CodexThreadStartedEvent
  | CodexThreadClosedEvent
  | CodexThreadArchivedEvent
  | CodexThreadUnarchivedEvent
  | CodexThreadNameUpdatedEvent
  | CodexTurnStartedEvent
  | CodexTurnCompletedEvent
  | CodexItemStartedEvent
  | CodexItemCompletedEvent
  | CodexAssistantDeltaEvent
  | CodexReasoningDeltaEvent
  | CodexCommandOutputDeltaEvent
  | CodexFileChangeDeltaEvent
  | CodexPlanUpdatedEvent
  | CodexApprovalRequestedEvent
  | CodexWarningEvent
  | CodexErrorEvent
  | CodexUnknownEvent;

export interface CodexThreadStartedEvent {
  type: "thread.started";
  threadId: string;
  params: unknown;
}

export interface CodexThreadClosedEvent {
  type: "thread.closed";
  threadId: string;
  params: unknown;
}

export interface CodexThreadArchivedEvent {
  type: "thread.archived";
  threadId: string;
  params: unknown;
}

export interface CodexThreadUnarchivedEvent {
  type: "thread.unarchived";
  threadId: string;
  params: unknown;
}

export interface CodexThreadNameUpdatedEvent {
  type: "thread.name_updated";
  threadId: string;
  name: string;
  params: unknown;
}

export interface CodexTurnStartedEvent {
  type: "turn.started";
  threadId: string;
  turnId: string;
  params: unknown;
}

export interface CodexTurnCompletedEvent {
  type: "turn.completed";
  threadId: string;
  turnId: string;
  params: unknown;
}

export interface CodexItemStartedEvent {
  type: "item.started";
  threadId: string;
  itemId: string;
  params: unknown;
}

export interface CodexItemCompletedEvent {
  type: "item.completed";
  threadId: string;
  item: ThreadItem;
  params: unknown;
}

export interface CodexAssistantDeltaEvent {
  type: "assistant.delta";
  threadId: string;
  turnId: string;
  delta: string;
  params: unknown;
}

export interface CodexReasoningDeltaEvent {
  type: "reasoning.delta";
  threadId: string;
  turnId: string;
  delta: string;
  params: unknown;
}

export interface CodexCommandOutputDeltaEvent {
  type: "command.output.delta";
  threadId: string;
  turnId: string;
  itemId: string;
  delta: string;
  params: unknown;
}

export interface CodexFileChangeDeltaEvent {
  type: "file.change.delta";
  threadId: string;
  turnId: string;
  itemId: string;
  changes: FileUpdateChange[];
  params: unknown;
}

export interface CodexPlanUpdatedEvent {
  type: "plan.updated";
  threadId: string;
  turnId: string;
  explanation: string | null;
  plan: Array<{ step: string; status: "pending" | "inProgress" | "completed" }>;
  params: unknown;
}

export interface CodexApprovalRequestedEvent {
  type: "approval.requested";
  request: JSONRPCRequest;
  /** Raw protocol method (e.g. "item/permissions/requestApproval"). Debug/routing only; UI must not display this. */
  method?: string;
  /** Normalized approval metadata. UI should use these, not raw request.params. */
  reason?: string;
  command?: string;
  cwd?: string;
}

export interface CodexWarningEvent {
  type: "warning";
  message: string;
  params: unknown;
}

export interface CodexErrorEvent {
  type: "error";
  message: string;
  willRetry: boolean;
  params: unknown;
}

export interface CodexUnknownEvent {
  type: "unknown";
  method: string;
  params: unknown;
}

// ── Normalizer ──

function stringValue(value: unknown, ...keys: string[]): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const obj = value as Record<string, unknown>;
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

/**
 * Normalize a JSON-RPC server request into a semantic approval event.
 * Extracts human-readable metadata so the UI never displays raw method names.
 */
export function normalizeServerRequest(request: JSONRPCRequest): CodexApprovalRequestedEvent {
  const p = (request.params ?? {}) as Record<string, unknown>;
  return {
    type: "approval.requested",
    request,
    method: request.method,
    reason: stringValue(p, "reason"),
    command: stringValue(p, "command"),
    cwd: stringValue(p, "cwd"),
  };
}

/**
 * Normalize a raw JSON-RPC notification into a typed CodexEvent.
 * The TUI should use this instead of listening to individual notification methods.
 */
export function normalizeNotification(
  notification: JSONRPCNotification,
): CodexEvent {
  const { method, params } = notification;

  switch (method) {
    case "thread/started":
      return {
        type: "thread.started",
        threadId: stringValue(params, "threadId", "thread_id") ?? "",
        params,
      };

    case "thread/closed":
      return {
        type: "thread.closed",
        threadId: stringValue(params, "threadId", "thread_id") ?? "",
        params,
      };

    case "thread/archived":
      return {
        type: "thread.archived",
        threadId: stringValue(params, "threadId", "thread_id") ?? "",
        params,
      };

    case "thread/unarchived":
      return {
        type: "thread.unarchived",
        threadId: stringValue(params, "threadId", "thread_id") ?? "",
        params,
      };

    case "thread/nameUpdated":
      return {
        type: "thread.name_updated",
        threadId: stringValue(params, "threadId", "thread_id") ?? "",
        name: stringValue(params, "name") ?? "",
        params,
      };

    case "turn/started":
      return {
        type: "turn.started",
        threadId: stringValue(params, "threadId", "thread_id") ?? "",
        turnId: stringValue(params, "turnId", "turn_id") ?? "",
        params,
      };

    case "turn/completed":
      return {
        type: "turn.completed",
        threadId: stringValue(params, "threadId", "thread_id") ?? "",
        turnId: stringValue(params, "turnId", "turn_id") ?? "",
        params,
      };

    case "turn/plan/updated": {
      const raw = (params as Record<string, unknown> | null) ?? {};
      const plan: CodexPlanUpdatedEvent["plan"] = [];
      if (Array.isArray(raw.plan)) {
        for (const s of raw.plan) {
          if (s && typeof s === "object") {
            const step = s as Record<string, unknown>;
            const status = stringValue(step, "status") ?? "";
            plan.push({
              step: stringValue(step, "step") ?? "",
              status: (status === "inProgress" || status === "pending" || status === "completed") ? status : "pending",
            });
          }
        }
      }
      return {
        type: "plan.updated",
        threadId: stringValue(params, "threadId", "thread_id") ?? "",
        turnId: stringValue(params, "turnId", "turn_id") ?? "",
        explanation: stringValue(raw, "explanation") ?? null,
        plan,
        params,
      };
    }

    case "item/started":
      return {
        type: "item.started",
        threadId: stringValue(params, "threadId", "thread_id") ?? "",
        itemId: stringValue(params, "itemId", "item_id") ?? "",
        params,
      };

    case "item/completed": {
      const item = (params as Record<string, unknown> | null)?.item;
      if (!item || typeof item !== "object") {
        return { type: "unknown", method, params };
      }
      return {
        type: "item.completed",
        threadId: stringValue(params, "threadId", "thread_id") ?? "",
        item: item as ThreadItem,
        params,
      };
    }

    case "item/agentMessage/delta":
      return {
        type: "assistant.delta",
        threadId: stringValue(params, "threadId", "thread_id") ?? "",
        turnId: stringValue(params, "turnId", "turn_id") ?? "",
        delta: stringValue(params, "delta") ?? "",
        params,
      };

    case "item/reasoning/textDelta":
      return {
        type: "reasoning.delta",
        threadId: stringValue(params, "threadId", "thread_id") ?? "",
        turnId: stringValue(params, "turnId", "turn_id") ?? "",
        delta: stringValue(params, "delta") ?? "",
        params,
      };

    case "item/commandExecution/outputDelta":
      return {
        type: "command.output.delta",
        threadId: stringValue(params, "threadId", "thread_id") ?? "",
        turnId: stringValue(params, "turnId", "turn_id") ?? "",
        itemId: stringValue(params, "itemId", "item_id") ?? "",
        delta: stringValue(params, "delta") ?? "",
        params,
      };

    case "item/fileChange/outputDelta":
      // Deprecated legacy notification for apply_patch textual output.
      // Map to unknown — the primary path is patchUpdated with changes[].
      return {
        type: "unknown",
        method,
        params,
      };

    case "item/fileChange/patchUpdated": {
      const raw = (params as Record<string, unknown> | null) ?? {};
      const changes: FileUpdateChange[] = [];
      if (Array.isArray(raw.changes)) {
        for (const c of raw.changes) {
          if (c && typeof c === "object") {
            changes.push(c as FileUpdateChange);
          }
        }
      }
      return {
        type: "file.change.delta",
        threadId: stringValue(params, "threadId", "thread_id") ?? "",
        turnId: stringValue(params, "turnId", "turn_id") ?? "",
        itemId: stringValue(params, "itemId", "item_id") ?? "",
        changes,
        params,
      };
    }

    case "warning":
      return {
        type: "warning",
        message: stringValue(params, "message") ?? JSON.stringify(params),
        params,
      };

    case "error":
      return {
        type: "error",
        message: stringValue(params, "message") ?? JSON.stringify(params),
        willRetry: (params as Record<string, unknown> | null)?.willRetry === true,
        params,
      };

    default:
      return { type: "unknown", method, params };
  }
}

/**
 * Helper to check if an event is of a specific type.
 * Useful for type narrowing in event handlers.
 */
export function isCodexEvent<T extends CodexEvent["type"]>(
  event: CodexEvent,
  type: T,
): event is Extract<CodexEvent, { type: T }> {
  return event.type === type;
}
