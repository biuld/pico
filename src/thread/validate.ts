import type {
  PicoThreadEntry,
  PicoThreadHeader,
  RolloutEntry,
} from "./types";

export const CURRENT_THREAD_VERSION = 1;

export interface LoadedEntryValidationContext {
  assertParent(parentId: string | null): void;
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

  const entry = raw as unknown as RolloutEntry;
  validateBaseEntry(entry);
  context.assertParent(entry.parentId);

  if (!isRecord(entry.item)) throw new Error("Invalid rollout entry: item");
  const type = entry.item.type;
  if (type === "branch_out") return entry;

  if (type === "response_item") {
    if (!isRecord(entry.item.payload)) throw new Error("Invalid response_item rollout item: payload");
    return entry;
  }

  if (type === "event_msg" || type === "compacted") return entry;

  throw new Error(`Unsupported rollout item type: ${String(type)}`);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateBaseEntry(entry: RolloutEntry): void {
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
