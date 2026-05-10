import { isTerminalTurnEntry } from "./entries";
import type {
  PicoThreadEntry,
  PicoThreadHeader,
  TurnAbortedEntry,
  TurnCompletedEntry,
  TurnEntry,
  TurnFailedEntry,
} from "./types";

export const CURRENT_THREAD_VERSION = 1;

export interface LoadedEntryValidationContext {
  assertParent(parentId: string | null): void;
  assertTurn(turnId: string): void;
  assertTurnHasNoTerminalEntry(turnId: string): void;
  hasEntry(id: string): boolean;
}

export function validatePicoThreadHeader(raw: unknown, path: string): PicoThreadHeader {
  if (!isRecord(raw)) throw new Error(`Invalid thread header in ${path}`);

  const header = raw as unknown as PicoThreadHeader;
  if (header.type !== "thread" || header.version !== CURRENT_THREAD_VERSION) {
    throw new Error(`Unsupported thread header in ${path}`);
  }
  if (typeof header.id !== "string" || header.id.length === 0) {
    throw new Error(`Invalid thread header id in ${path}`);
  }
  if (typeof header.createdAt !== "string") {
    throw new Error(`Invalid thread header createdAt in ${path}`);
  }
  if (typeof header.cwd !== "string") {
    throw new Error(`Invalid thread header cwd in ${path}`);
  }
  if (!isRecord(header.config)) {
    throw new Error(`Invalid thread header config in ${path}`);
  }

  return header;
}

export function validateLoadedThreadEntry(
  raw: unknown,
  context: LoadedEntryValidationContext,
): PicoThreadEntry {
  if (!isRecord(raw)) throw new Error("Invalid thread entry: expected object");

  const type = raw.type;
  if (typeof type !== "string") throw new Error("Invalid thread entry: missing type");
  const entry = raw as unknown as PicoThreadEntry;

  validateBaseEntry(entry);
  context.assertParent(entry.parentId);

  if (entry.type === "turn") {
    if (typeof entry.userInput !== "string") throw new Error("Invalid turn entry: userInput");
    if (typeof entry.cwd !== "string") throw new Error("Invalid turn entry: cwd");
    if (!isTurnStatus(entry.status)) throw new Error("Invalid turn entry: status");
    if (typeof entry.startedAt !== "string") throw new Error("Invalid turn entry: startedAt");
    if (entry.overrides !== undefined && !isRecord(entry.overrides)) {
      throw new Error("Invalid turn entry: overrides");
    }
    return entry;
  }

  if (entry.type === "response_item") {
    if (typeof entry.turnId !== "string") throw new Error("Invalid response_item entry: turnId");
    context.assertTurn(entry.turnId);
    if (!isRecord(entry.responseItem)) throw new Error("Invalid response_item entry: responseItem");
    return entry;
  }

  if (entry.type === "turn_completed") {
    validateTerminalTurnEntry(entry, "completed", context);
    if (typeof entry.completedAt !== "string") throw new Error("Invalid turn_completed entry: completedAt");
    return entry;
  }

  if (entry.type === "turn_failed") {
    validateTerminalTurnEntry(entry, "failed", context);
    if (typeof entry.failedAt !== "string") throw new Error("Invalid turn_failed entry: failedAt");
    if (typeof entry.error !== "string") throw new Error("Invalid turn_failed entry: error");
    return entry;
  }

  if (entry.type === "turn_aborted") {
    validateTerminalTurnEntry(entry, "aborted", context);
    if (typeof entry.abortedAt !== "string") throw new Error("Invalid turn_aborted entry: abortedAt");
    if (entry.reason !== undefined && typeof entry.reason !== "string") {
      throw new Error("Invalid turn_aborted entry: reason");
    }
    return entry;
  }

  if (entry.type === "label") {
    if (typeof entry.targetId !== "string" || !context.hasEntry(entry.targetId)) {
      throw new Error(`Label target entry not found: ${entry.targetId}`);
    }
    if (typeof entry.label !== "string") throw new Error("Invalid label entry: label");
    return entry;
  }

  if (entry.type === "branch") {
    if (typeof entry.targetId !== "string" || !context.hasEntry(entry.targetId)) {
      throw new Error(`Branch target entry not found: ${entry.targetId}`);
    }
    if (entry.name !== undefined && typeof entry.name !== "string") {
      throw new Error("Invalid branch entry: name");
    }
    return entry;
  }

  if (entry.type === "config_change") {
    if (!isRecord(entry.config)) throw new Error("Invalid config_change entry: config");
    return entry;
  }

  throw new Error(`Unsupported thread entry type: ${type}`);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateBaseEntry(entry: PicoThreadEntry): void {
  if (typeof entry.id !== "string" || entry.id.length === 0) {
    throw new Error("Invalid thread entry: id");
  }
  if (entry.parentId !== null && typeof entry.parentId !== "string") {
    throw new Error("Invalid thread entry: parentId");
  }
  if (typeof entry.timestamp !== "string") {
    throw new Error("Invalid thread entry: timestamp");
  }
}

function validateTerminalTurnEntry(
  entry: TurnCompletedEntry | TurnFailedEntry | TurnAbortedEntry,
  status: TurnCompletedEntry["status"] | TurnFailedEntry["status"] | TurnAbortedEntry["status"],
  context: LoadedEntryValidationContext,
): void {
  if (typeof entry.turnId !== "string") throw new Error(`Invalid ${entry.type} entry: turnId`);
  context.assertTurn(entry.turnId);
  context.assertTurnHasNoTerminalEntry(entry.turnId);
  if (entry.status !== status) throw new Error(`Invalid ${entry.type} entry: status`);
}

function isTurnStatus(value: unknown): value is TurnEntry["status"] {
  return value === "started" || value === "completed" || value === "failed" || value === "aborted";
}

export { isTerminalTurnEntry };
