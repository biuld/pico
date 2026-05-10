import type {
  BranchEntry,
  ResponseItemEntry,
  SessionEntry,
  SessionStore,
  TurnAbortedEntry,
  TurnCompletedEntry,
  TurnEntry,
  TurnFailedEntry,
} from "../session/store";
import { responseItemAgentText } from "./response-items";

export interface HistoryTurnRow {
  id: string;
  turnId: string;
  depth: number;
  isActive: boolean;
  isSelected: boolean;
  userPrefix: string;
  summaryPrefix: string;
  userText: string;
  agentSummary: string;
  status: TurnEntry["status"];
}

interface TurnNode {
  turn: TurnEntry;
  order: number;
  endId: string;
  agentParts: string[];
  failed?: string;
  aborted?: string;
}

const ROOT = "__pico_history_root__";
const USER_MARKER_WIDTH = 2;

export function buildHistoryTurnRows(
  store: SessionStore,
  selectedEntryId = store.leafId,
): HistoryTurnRow[] {
  const entries = [...store.allEntries];
  const byId = entryMap(entries);
  const nodes = new Map<string, TurnNode>();
  const children = new Map<string, string[]>();

  for (const [index, entry] of entries.entries()) {
    if (entry.type !== "turn") continue;

    const parentTurnId = branchParentTurnId(byId, entry.parentId);
    const parentKey = parentTurnId || ROOT;
    nodes.set(entry.id, {
      turn: entry,
      order: index,
      endId: entry.id,
      agentParts: [],
    });
    children.set(parentKey, [...(children.get(parentKey) || []), entry.id]);
  }

  for (const entry of entries) {
    if (entry.type === "response_item") {
      addResponseItem(nodes, entry);
    } else if (entry.type === "turn_completed") {
      const node = nodes.get(entry.turnId);
      if (node) node.endId = entry.id;
    } else if (entry.type === "turn_failed") {
      const node = nodes.get(entry.turnId);
      if (node) {
        node.endId = entry.id;
        node.failed = entry.error;
      }
    } else if (entry.type === "turn_aborted") {
      const node = nodes.get(entry.turnId);
      if (node) {
        node.endId = entry.id;
        node.aborted = entry.reason || "aborted";
      }
    }
  }

  for (const ids of children.values()) {
    ids.sort((a, b) => (nodes.get(a)?.order || 0) - (nodes.get(b)?.order || 0));
  }

  const selectedTurnId = turnIdForEntry(byId, selectedEntryId);
  const activeTurnId = turnIdForEntry(byId, store.leafId);
  const rows: HistoryTurnRow[] = [];

  const visit = (turnId: string, ancestorLasts: boolean[], isLast: boolean) => {
    const node = nodes.get(turnId);
    if (!node) return;

    const prefix = treePrefix(ancestorLasts);
    rows.push({
      id: node.endId,
      turnId,
      depth: ancestorLasts.length,
      isActive: turnId === activeTurnId,
      isSelected: turnId === selectedTurnId,
      userPrefix: `${prefix}${isLast ? "└── " : "├── "}`,
      summaryPrefix: `${prefix}${isLast ? "    " : "│   "}`,
      userText: truncate(node.turn.userInput, 96),
      agentSummary: turnSummary(node),
      status: node.turn.status,
    });

    const childIds = children.get(turnId) || [];
    childIds.forEach((childId, index) => {
      visit(childId, [...ancestorLasts, isLast], index === childIds.length - 1);
    });
  };

  const rootTurns = children.get(ROOT) || [];
  rootTurns.forEach((turnId, index) => {
    visit(turnId, [], index === rootTurns.length - 1);
  });

  return rows;
}

export function historySelectionTargetId(
  store: SessionStore,
  entryId = store.leafId,
): string | undefined {
  const rows = buildHistoryTurnRows(store, entryId);
  const selected = rows.find((row) => row.isSelected);
  return selected?.id || rows.at(-1)?.id;
}

export function formatHistoryTurnRow(row: HistoryTurnRow): string {
  return [
    `${row.userPrefix}${historyUserMarker(row)}${row.userText}`,
    `${row.summaryPrefix}${" ".repeat(USER_MARKER_WIDTH)}${row.agentSummary}`,
  ].join("\n");
}

export function historyUserMarker(row: Pick<HistoryTurnRow, "isSelected">): string {
  return row.isSelected ? "› " : "  ";
}

function addResponseItem(nodes: Map<string, TurnNode>, entry: ResponseItemEntry): void {
  const node = nodes.get(entry.turnId);
  if (!node) return;

  node.endId = entry.id;
  const text = responseItemAgentText(entry.responseItem);
  if (text) node.agentParts.push(text);
}

function turnSummary(node: TurnNode): string {
  if (node.failed) return `agent: failed: ${truncate(node.failed)}`;
  if (node.aborted) return `agent: aborted: ${truncate(node.aborted)}`;

  const text = node.agentParts.join(" ").replace(/\s+/g, " ").trim();
  if (!text) return "agent: no assistant summary";
  return `agent: ${truncate(text, 112)}`;
}

function entryMap(entries: readonly SessionEntry[]): Map<string, SessionEntry> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

function nearestTurnAncestor(
  byId: Map<string, SessionEntry>,
  entryId: string | null,
): string | undefined {
  const seen = new Set<string>();
  let current = entryId;

  while (current) {
    if (seen.has(current)) return undefined;
    seen.add(current);

    const entry = byId.get(current);
    if (!entry) return undefined;
    if (entry.type === "turn") return entry.id;
    current = entry.parentId;
  }

  return undefined;
}

function branchParentTurnId(
  byId: Map<string, SessionEntry>,
  entryId: string | null,
): string | undefined {
  const branch = nearestBranchAncestor(byId, entryId);
  return branch ? nearestTurnAncestor(byId, branch.targetId) : undefined;
}

function nearestBranchAncestor(
  byId: Map<string, SessionEntry>,
  entryId: string | null,
): BranchEntry | undefined {
  const seen = new Set<string>();
  let current = entryId;

  while (current) {
    if (seen.has(current)) return undefined;
    seen.add(current);

    const entry = byId.get(current);
    if (!entry) return undefined;
    if (entry.type === "branch") return entry;
    current = entry.parentId;
  }

  return undefined;
}

function turnIdForEntry(
  byId: Map<string, SessionEntry>,
  entryId: string,
): string | undefined {
  const entry = byId.get(entryId);
  if (!entry) return undefined;
  if (entry.type === "turn") return entry.id;
  if (hasTurnId(entry)) return entry.turnId;
  return nearestTurnAncestor(byId, entry.parentId);
}

function hasTurnId(
  entry: SessionEntry,
): entry is ResponseItemEntry | TurnCompletedEntry | TurnFailedEntry | TurnAbortedEntry {
  return "turnId" in entry;
}

function treePrefix(ancestorLasts: readonly boolean[]): string {
  return ancestorLasts.map((isLast) => (isLast ? "    " : "│   ")).join("");
}

function truncate(value: string, maxLength = 72): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}
