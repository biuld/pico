import { normalizeCodexStatusValue } from "../codex/app-server";
import type { CodexRawResponseItemCompletedNotification, JSONRPCRequest } from "../codex/app-server";
import type { ItemCompletedNotification, ThreadItem } from "@pico/codex-app-server-protocol/v2";
import { picoConfig } from "../config";
import type { EventLine, PicoThreadStore, ResponseItem, TurnOverrides } from "../thread/store";
import type {
  AppState,
  AssistantDeltaEvent,
  TurnObserver,
  RawItemEvent,
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
  const { store, codex } = app;
  const snapshot = picoConfig.snapshot();
  const { codexBinary: _codexBinary, ...configOverrides } = snapshot;
  const turnOverrides: TurnOverrides = { ...configOverrides, ...overrides };

  let threadId: string | undefined;
  let picoTurnId: string | undefined;
  let codexTurnId: string | undefined;
  let parentId = store.leafId;

  try {
    const branchParentId = await store.ensureBranchForAppend();
    if (branchParentId !== parentId) {
      observer?.onThreadChanged?.({ type: "branch", leafId: store.leafId, fromId: parentId });
      parentId = branchParentId;
    }

    const rolloutPath = await store.writeLinearizedRolloutFile(parentId);
    const thread = await codex.forkEphemeralThreadFromPath(rolloutPath, {
      cwd: turnOverrides.cwd || store.cwd,
      model: turnOverrides.model,
      modelProvider: turnOverrides.modelProvider,
      approvalPolicy: turnOverrides.approvalPolicy,
      sandbox: turnOverrides.sandbox as string | undefined,
      personality: turnOverrides.personality,
      developerInstructions: turnOverrides.developerInstructions,
    });
    threadId = thread.thread.id;

    const picoTurn = await store.appendUserInput(parentId, userInput, turnOverrides);
    picoTurnId = picoTurn.id;
    parentId = picoTurn.id;
    codexTurnId = picoTurn.id;
    observer?.onTurnStarted?.({
      threadId,
      turnId: picoTurn.id,
      userInput,
      threadStatus: normalizeCodexStatusValue(thread.thread.status),
      model: thread.model,
      modelProvider: thread.modelProvider,
    } satisfies TurnStartedEvent);

    let rawItemCount = 0;
    const bufferedRawItems: ResponseItem[] = [];
    let pendingRawWrites = Promise.resolve();
    let rawItemError: Error | undefined;

    const queueRawItemWrite = (item: ResponseItem) => {
      pendingRawWrites = pendingRawWrites.then(async () => {
        const entry = await store.appendResponseItem(parentId, item);
        parentId = entry.id;
        rawItemCount += 1;
        observer?.onRawItemCompleted?.({
          threadId: threadId!,
          turnId: picoTurn.id,
          item,
          entryId: entry.id,
        } satisfies RawItemEvent);
      });
    };

    const onDelta = (params: unknown) => {
      const value = params as Record<string, unknown> | undefined;
      const maybeThreadId = value?.threadId || value?.thread_id;
      if (maybeThreadId && maybeThreadId !== threadId) return;
      if (typeof value?.delta === "string") {
        observer?.onAssistantDelta?.({
          threadId: threadId!,
          turnId: codexTurnId,
          delta: value.delta,
        } satisfies AssistantDeltaEvent);
      }
    };

    const onServerRequest = async (request: JSONRPCRequest) => {
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
    };

    const onRawItem = (params: unknown) => {
      const value = params as
        | (Partial<CodexRawResponseItemCompletedNotification> & Record<string, unknown>)
        | undefined;
      const maybeThreadId = value?.threadId || value?.thread_id;
      const maybeTurnId = value?.turnId || value?.turn_id;
      if (maybeThreadId !== threadId) return;
      if (codexTurnId !== picoTurn.id && maybeTurnId !== codexTurnId) return;
      if (!value?.item || typeof value.item !== "object") {
        rawItemError = new Error(
          `Invalid rawResponseItem/completed payload: ${JSON.stringify(value)}`,
        );
        return;
      }
      if (codexTurnId === picoTurn.id) {
        bufferedRawItems.push(value.item as ResponseItem);
        return;
      }
      queueRawItemWrite(value.item as ResponseItem);
    };

    const onItemCompleted = (params: ItemCompletedNotification) => {
      if (params.threadId !== threadId) return;
      const item = params.item as ThreadItem;
      if (item.type !== "fileChange") return;
      const fileChanges = (item as { type: "fileChange"; changes: Array<{ path: string; kind: string; diff: string }> }).changes;
      for (const change of fileChanges) {
        pendingRawWrites = pendingRawWrites.then(async () => {
          const entry = await store.appendEventMsg(parentId, {
            type: "file_change",
            path: change.path,
            diff: change.diff,
            kind: change.kind,
          });
          parentId = entry.id;
        });
      }
    };

    codex.on("item/agentMessage/delta", onDelta);
    codex.on("serverRequest", onServerRequest);
    codex.on("rawResponseItem/completed", onRawItem);
    codex.on("item/completed", onItemCompleted);

    let terminalEntryWritten = false;

    try {
      const started = await codex.startTurn(threadId, userInput, {
        model: turnOverrides.model,
        modelProvider: turnOverrides.modelProvider,
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
        turnId: picoTurn.id,
        codexTurnId: turnId,
        userInput,
        threadStatus: normalizeCodexStatusValue(started.turn.status),
        model: turnOverrides.model || thread.model,
        modelProvider: turnOverrides.modelProvider || thread.modelProvider,
      } satisfies TurnStartedEvent);

      for (const item of bufferedRawItems) {
        queueRawItemWrite(item);
      }
      bufferedRawItems.length = 0;

      const completed = await codex.waitForTurnCompleted(threadId, turnId);
      await pendingRawWrites;
      if (rawItemError) throw rawItemError;

      const terminalStatus = turnCompletionStatus(completed);
      if (terminalStatus === "interrupted" || terminalStatus === "aborted") {
        const reason = turnAbortedReason(completed);
        const aborted = await appendTurnEvent(store, parentId, "turn_aborted", {
          turnId: picoTurn.id,
          reason,
          codexTurnId: turnId,
        });
        parentId = aborted.id;
        terminalEntryWritten = true;
        const result = {
          turnId: picoTurn.id,
          codexTurnId: turnId,
          status: "aborted",
          rawItemCount,
          leafId: store.leafId,
          completed,
        } satisfies TurnResult;
        observer?.onTurnAborted?.({
          threadId,
          ...result,
          reason,
        } satisfies TurnAbortedEvent);
        observer?.onThreadChanged?.({ type: "turn", leafId: store.leafId });
        return result;
      }
      if (terminalStatus === "failed") {
        const error = turnFailureError(completed);
        const failed = await appendTurnEvent(store, parentId, "turn_failed", {
          turnId: picoTurn.id,
          error: error.message,
          codexTurnId: turnId,
        });
        parentId = failed.id;
        terminalEntryWritten = true;
        throw error;
      }

      const completedEntry = await appendTurnEvent(store, parentId, "turn_completed", {
        turnId: picoTurn.id,
        codexTurnId: turnId,
        completed,
      });
      parentId = completedEntry.id;
      terminalEntryWritten = true;
      const result = {
        turnId: picoTurn.id,
        codexTurnId: turnId,
        status: "completed",
        rawItemCount,
        leafId: store.leafId,
        completed,
      } satisfies TurnResult;
      observer?.onTurnCompleted?.({ threadId, ...result } satisfies TurnCompletedEvent);
      observer?.onThreadChanged?.({ type: "turn", leafId: store.leafId });
      return result;
    } catch (err) {
      await pendingRawWrites.catch(() => {});
      if (!terminalEntryWritten) {
        await appendTurnEvent(store, parentId, "turn_failed", {
          turnId: picoTurn.id,
          error: err instanceof Error ? err.message : String(err),
          codexTurnId,
        });
      }
      throw err;
    } finally {
      codex.off("item/agentMessage/delta", onDelta);
      codex.off("serverRequest", onServerRequest);
      codex.off("rawResponseItem/completed", onRawItem);
      codex.off("item/completed", onItemCompleted);
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

function appendTurnEvent(
  store: PicoThreadStore,
  parentId: string,
  type: "turn_completed" | "turn_failed" | "turn_aborted",
  payload: Record<string, unknown>,
): Promise<EventLine> {
  return store.appendEventMsg(parentId, {
    type,
    ...payload,
    timestamp: new Date().toISOString(),
  });
}
