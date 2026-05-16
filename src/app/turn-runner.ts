import { normalizeCodexStatusValue } from "../codex/app-server";
import type { JSONRPCRequest, CodexEvent } from "../codex/app-server";
import type { ThreadItem } from "@pico/codex-app-server-protocol/v2";
import { picoConfig } from "../config";
import type { CodexThreadViewState, TurnOverrides } from "./codex-thread-view-state";
import type {
  AppState,
  AssistantDeltaEvent,
  TurnObserver,
  RunTurnOptions,
  TurnAbortedEvent,
  TurnCompletedEvent,
  TurnFailedEvent,
  TurnResult,
  TurnStartedEvent,
} from "./types";

export async function runTurn(
  app: AppState,
  userInput: string,
  optionsOrAskApproval: RunTurnOptions | ((request: JSONRPCRequest) => Promise<unknown>) = {},
  legacyOverrides: TurnOverrides = {},
): Promise<TurnResult> {
  const options =
    typeof optionsOrAskApproval === "function"
      ? { askApproval: optionsOrAskApproval, overrides: legacyOverrides }
      : optionsOrAskApproval;
  const { askApproval, overrides = {}, observer } = options;
  const { viewState, codex } = app;
  const snapshot = picoConfig.snapshot();
  const { codexBinary: _codexBinary, ...configOverrides } = snapshot;
  const turnOverrides: TurnOverrides = { ...configOverrides, ...overrides };

  let threadId: string | undefined;
  let picoTurnId: string | undefined;
  let codexTurnId: string | undefined;

  try {
    // Use Codex-native thread management
    const codexThreadId = viewState.codexThreadId;

    const threadParams = {
      cwd: turnOverrides.cwd || viewState.cwd,
      model: turnOverrides.model ?? undefined,
      modelProvider: turnOverrides.modelProvider ?? undefined,
      approvalPolicy: turnOverrides.approvalPolicy ?? undefined,
      sandbox: turnOverrides.sandbox,
      personality: turnOverrides.personality ?? undefined,
      developerInstructions: turnOverrides.developerInstructions,
    };

    let thread: { thread: { id: string; status?: unknown }; model: string; modelProvider: string; cwd: string };

    if (codexThreadId) {
      thread = await codex.resumeThread(codexThreadId, threadParams as Record<string, unknown>);
    } else {
      thread = await codex.startThread(threadParams as Record<string, unknown>);
      viewState.codexThreadId = thread.thread.id;
    }
    threadId = thread.thread.id;

    // Start turn in view state
    viewState.startTurn(userInput);
    picoTurnId = `turn-${Date.now().toString(36)}`;

    observer?.onTurnStarted?.({
      threadId,
      turnId: picoTurnId,
      userInput,
      threadStatus: normalizeCodexStatusValue(thread.thread.status),
      model: thread.model,
      modelProvider: thread.modelProvider,
    } satisfies TurnStartedEvent);

    const onCodexEvent = async (event: CodexEvent) => {
      switch (event.type) {
        case "assistant.delta": {
          if (event.threadId !== threadId) return;
          viewState.appendDelta(event.delta);
          observer?.onAssistantDelta?.({
            threadId: threadId!,
            turnId: codexTurnId,
            delta: event.delta,
          } satisfies AssistantDeltaEvent);
          break;
        }
        case "item.completed": {
          if (event.threadId !== threadId) return;
          const item = event.item;
          viewState.addLiveItem(item);
          observer?.onThreadItemCompleted?.(item);
          break;
        }
        case "approval.requested": {
          const request = event.request;
          observer?.onApprovalRequested?.(request);
          try {
            const result = askApproval ? await askApproval(request) : defaultServerRequestResult(request);
            codex.resolveServerRequest(request.id, result);
            observer?.onApprovalResolved?.({ request, result });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            codex.rejectServerRequest(request.id, -32000, message);
            observer?.onApprovalRejected?.({ request, error: message });
          }
          break;
        }
      }
    };

    codex.on("codex:event", onCodexEvent);

    try {
      const started = await codex.startTurn(threadId, userInput, {
        model: turnOverrides.model ?? undefined,
        modelProvider: turnOverrides.modelProvider ?? undefined,
        cwd: turnOverrides.cwd,
        approvalPolicy: turnOverrides.approvalPolicy,
        sandbox: turnOverrides.sandbox,
        personality: turnOverrides.personality,
        developerInstructions: turnOverrides.developerInstructions,
      });
      const turnId = started.turn.id;
      codexTurnId = turnId;
      observer?.onCodexTurnStarted?.({
        threadId,
        turnId: picoTurnId,
        codexTurnId: turnId,
        userInput,
        threadStatus: normalizeCodexStatusValue(started.turn.status),
        model: turnOverrides.model ?? thread.model ?? undefined,
        modelProvider: turnOverrides.modelProvider ?? thread.modelProvider ?? undefined,
      } satisfies TurnStartedEvent);

      const completed = await codex.waitForTurnCompleted(threadId, turnId);

      // Refresh thread view from Codex
      let refreshedThread: Awaited<ReturnType<typeof codex.readThread>> | null = null;
      try {
        refreshedThread = await codex.readThread(threadId, true);
      } catch {
        // readThread is best-effort for view refresh
      }

      const terminalStatus = turnCompletionStatus(completed);
      if (terminalStatus === "interrupted" || terminalStatus === "aborted") {
        const reason = turnAbortedReason(completed);
        viewState.abortTurn();
        const result: TurnResult = {
          turnId: picoTurnId,
          codexTurnId: turnId,
          status: "aborted",
          completed,
        };
        observer?.onTurnAborted?.({
          threadId,
          turnId: result.turnId,
          codexTurnId: result.codexTurnId,
          status: "aborted" as const,
          completed: result.completed,
          reason,
        });
        return result;
      }
      if (terminalStatus === "failed") {
        const error = turnFailureError(completed);
        viewState.abortTurn();
        throw error;
      }

      // Successful completion — refresh view cache
      if (refreshedThread?.thread) {
        viewState.finishTurn(refreshedThread.thread);
      } else {
        // Refresh failed — keep existing cachedThread, only clear live state
        viewState.clearLiveTurn();
      }
      const result: TurnResult = {
        turnId: picoTurnId,
        codexTurnId: turnId,
        status: "completed",
        completed,
      };
      observer?.onTurnCompleted?.({
        threadId,
        turnId: result.turnId,
        codexTurnId: result.codexTurnId,
        status: "completed" as const,
        completed: result.completed,
      });
      return result;
    } catch (err) {
      viewState.abortTurn();
      throw err;
    } finally {
      codex.off("codex:event", onCodexEvent);
    }
  } catch (err) {
    const error = err instanceof Error ? err : String(err);
    observer?.onTurnFailed?.({
      threadId,
      turnId: picoTurnId,
      error,
    } satisfies TurnFailedEvent);
    throw err;
  }
}

export function defaultServerRequestResult(request: JSONRPCRequest): unknown {
  return approvalResult(request.method, "decline");
}

export function approvalResult(
  method: string,
  decision: "accept" | "decline" | "acceptForSession",
): unknown {
  if (method === "item/permissions/requestApproval") {
    return { decision: decision === "decline" ? "deny" : "approve" };
  }
  if (decision === "acceptForSession") {
    return { decision: "acceptForSession" };
  }
  return { decision: decision === "accept" ? "accept" : "decline" };
}

function turnCompletionStatus(completed: unknown): string | undefined {
  const value = objectValue(completed);
  const turn = objectValue(value.turn);
  return normalizeCodexStatusValue(turn.status) || normalizeCodexStatusValue(value.status);
}

function turnAbortedReason(completed: unknown): string {
  const message = turnErrorMessage(completed);
  return message || "Turn interrupted";
}

function turnFailureError(completed: unknown): Error {
  const message = turnErrorMessage(completed) || "Turn failed";
  return new Error(message);
}

function turnErrorMessage(completed: unknown): string | undefined {
  const value = objectValue(completed);
  const turn = objectValue(value.turn);
  const error = maybeObjectValue(turn.error) || maybeObjectValue(value.error) || {};
  return stringValue(error.message) || stringValue(error.additionalDetails);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function maybeObjectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
