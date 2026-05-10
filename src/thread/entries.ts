import type {
  PicoThreadEntry,
  TurnAbortedEntry,
  TurnCompletedEntry,
  TurnFailedEntry,
} from "./types";

export function entryMovesLeaf(entry: PicoThreadEntry): boolean {
  return entry.type !== "label";
}

export function isTerminalTurnEntry(
  entry: PicoThreadEntry,
): entry is TurnCompletedEntry | TurnFailedEntry | TurnAbortedEntry {
  return entry.type === "turn_completed" || entry.type === "turn_failed" || entry.type === "turn_aborted";
}
