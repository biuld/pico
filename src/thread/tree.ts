import type {
  PicoThreadEntry,
  ResponseItem,
  RolloutEntry,
} from "./types";

export function getPathEntries(
  rootId: string,
  entries: readonly PicoThreadEntry[],
  leafId: string,
): PicoThreadEntry[] {
  if (leafId === rootId) return [];

  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const path: PicoThreadEntry[] = [];
  const seen = new Set<string>();
  let current: string | null = leafId;

  while (current && current !== rootId) {
    if (seen.has(current)) {
      throw new Error(`Cycle detected in thread path at ${current}`);
    }
    seen.add(current);

    const entry = byId.get(current);
    if (!entry) {
      throw new Error(`Broken thread path, missing parent entry: ${current}`);
    }
    path.unshift(entry);
    current = entry.parentId;
  }

  return path;
}

export function linearizeForCodex(
  rootId: string,
  entries: readonly PicoThreadEntry[],
  leafId: string,
): unknown[] {
  return getPathEntries(rootId, entries, leafId)
    .filter((entry) => entry.item.type !== "branch_out")
    .map(codexRolloutLine);
}

export function collectResponseItems(
  rootId: string,
  entries: readonly PicoThreadEntry[],
  leafId: string,
): ResponseItem[] {
  return getPathEntries(rootId, entries, leafId)
    .filter((entry) => entry.item.type === "response_item")
    .map((entry) => entry.item.payload);
}

export function childrenOf(
  entries: readonly PicoThreadEntry[],
  parentId: string,
): PicoThreadEntry[] {
  return entries.filter((entry) => entry.parentId === parentId);
}

export function isUserInputEntry(entry: RolloutEntry): boolean {
  if (entry.item.type !== "response_item") return false;
  const payload = entry.item.payload;
  return payload.role === "user" || (payload.pico as Record<string, unknown> | undefined)?.kind === "user_input";
}

function codexRolloutLine(entry: RolloutEntry): unknown {
  return {
    timestamp: entry.timestamp,
    type: entry.item.type,
    payload: entry.item.payload,
  };
}
