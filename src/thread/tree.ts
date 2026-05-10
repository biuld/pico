import type {
  PicoThreadEntry,
  ResponseItem,
  ResponseItemEntry,
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

export function collectInjectItems(
  rootId: string,
  entries: readonly PicoThreadEntry[],
  leafId: string,
): ResponseItem[] {
  return getPathEntries(rootId, entries, leafId)
    .filter((entry): entry is ResponseItemEntry => entry.type === "response_item")
    .map((entry) => entry.responseItem);
}

export function childrenOf(
  entries: readonly PicoThreadEntry[],
  parentId: string,
): PicoThreadEntry[] {
  return entries.filter((entry) => entry.parentId === parentId);
}

export function labels(entries: readonly PicoThreadEntry[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const entry of entries) {
    if (entry.type === "label") result.set(entry.targetId, entry.label);
  }
  return result;
}
