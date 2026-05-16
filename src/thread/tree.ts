import type { ResponseItem } from "@pico/codex-app-server-protocol";
import type { PicoLine, RolloutLine } from "./types";

// ── Helpers ────────────────────────────────────────────────

function parentOf(line: PicoLine): string | null {
  return "parent" in line ? (line.parent ?? null) : null;
}

// ── Path walking ───────────────────────────────────────────

/**
 * Walk the parent chain from `leafId` up to (but not including) `rootId`.
 * Returns lines in chronological order (root → leaf).
 */
export function getPathEntries(
  rootId: string,
  lines: readonly PicoLine[],
  leafId: string,
): PicoLine[] {
  if (leafId === rootId) return [];

  const byId = new Map(lines.map((line) => [line.id, line]));
  const path: PicoLine[] = [];
  const seen = new Set<string>();
  let current: string | null = leafId;

  while (current && current !== rootId) {
    if (seen.has(current)) {
      throw new Error(`Cycle detected in thread path at ${current}`);
    }
    seen.add(current);

    const line = byId.get(current);
    if (!line) {
      throw new Error(`Broken thread path, missing parent: ${current}`);
    }
    path.unshift(line);
    current = parentOf(line);
  }

  return path;
}

// ── Codex linearization ────────────────────────────────────

/**
 * Walk as `getPathEntries`, filter out branch_out and event_msg,
 * strip id/parent, return plain `{timestamp, type, payload}` objects.
 */
export function linearizeForCodex(
  rootId: string,
  lines: readonly PicoLine[],
  leafId: string,
): unknown[] {
  return getPathEntries(rootId, lines, leafId)
    .filter(
      (line): line is RolloutLine =>
        line.type !== "branch_out" && line.type !== "event_msg",
    )
    .map((line) => ({
      timestamp: line.timestamp,
      type: line.type,
      payload: line.payload,
    }));
}

// ── Response item collection ───────────────────────────────

export function collectResponseItems(
  rootId: string,
  lines: readonly PicoLine[],
  leafId: string,
): ResponseItem[] {
  return getPathEntries(rootId, lines, leafId)
    .filter((line): line is RolloutLine => line.type === "response_item")
    .map((line) => line.payload as ResponseItem);
}

// ── Children ───────────────────────────────────────────────

export function childrenOf(
  lines: readonly PicoLine[],
  parentId: string,
): PicoLine[] {
  return lines.filter((line) => parentOf(line) === parentId);
}

// ── User input detection ───────────────────────────────────

export function isUserInputLine(line: PicoLine): boolean {
  if (line.type !== "response_item") return false;
  const payload = line.payload as Record<string, unknown> | undefined;
  if (!payload) return false;
  return (
    payload.role === "user" ||
    (payload.pico as Record<string, unknown> | undefined)?.kind === "user_input"
  );
}
