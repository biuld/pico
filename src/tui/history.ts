import type {
  PicoThreadEntry,
  PicoThreadStore,
  ResponseItem,
} from "../thread/store";
import { entryUserText } from "../thread/store";
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
  status: "started" | "completed" | "failed" | "aborted";
}

interface TurnNode {
  id: string;
  parentId: string | null;
  order: number;
  endId: string;
  userText: string;
  agentParts: string[];
  status: HistoryTurnRow["status"];
  failure?: string;
}

const ROOT = "__pico_history_root__";
const USER_MARKER_WIDTH = 0;
const AGENT_SUMMARY_MAX_LENGTH = 36;

export function buildHistoryTurnRows(
  store: PicoThreadStore,
  selectedEntryId = store.leafId,
): HistoryTurnRow[] {
  const entries = [...store.allEntries];
  const nodes = new Map<string, TurnNode>();
  const entryToTurn = new Map<string, string>();
  const children = new Map<string, string[]>();
  const activeTurnId = nearestTurnId(store.getPathEntries(), entryToTurn);

  for (const [index, entry] of entries.entries()) {
    const userText = entryUserText(entry);
    if (!userText) continue;

    const parentTurnId = nearestTurnAncestor(entries, entry.parentId);
    const parentKey = parentTurnId || ROOT;
    nodes.set(entry.id, {
      id: entry.id,
      parentId: parentTurnId || null,
      order: index,
      endId: entry.id,
      userText,
      agentParts: [],
      status: "completed",
    });
    entryToTurn.set(entry.id, entry.id);
    children.set(parentKey, [...(children.get(parentKey) || []), entry.id]);
  }

  let currentTurnId: string | undefined;
  for (const entry of entries) {
    if (entryUserText(entry)) {
      currentTurnId = entry.id;
      continue;
    }
    const turnId = nearestTurnAncestor(entries, entry.parentId) || currentTurnId;
    if (!turnId) continue;
    entryToTurn.set(entry.id, turnId);
    const node = nodes.get(turnId);
    if (!node) continue;
    node.endId = entry.id;
    if (entry.item.type === "response_item") {
      const text = responseItemAgentText(entry.item.payload as ResponseItem);
      if (text) node.agentParts.push(text);
    } else if (entry.item.type === "event_msg") {
      const event = entry.item.payload as Record<string, unknown> | undefined;
      if (event?.type === "turn_failed") {
        node.status = "failed";
        node.failure = typeof event.error === "string" ? event.error : "failed";
      } else if (event?.type === "turn_aborted") {
        node.status = "aborted";
        node.failure = typeof event.reason === "string" ? event.reason : "aborted";
      }
    }
  }

  for (const ids of children.values()) {
    ids.sort((a, b) => (nodes.get(a)?.order || 0) - (nodes.get(b)?.order || 0));
  }

  const selectedTurnId = turnIdForEntry(entries, selectedEntryId);
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
      userText: truncate(node.userText, 96),
      agentSummary: turnSummary(node),
      status: node.status,
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
  store: PicoThreadStore,
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

export function historyUserMarker(_row: Pick<HistoryTurnRow, "isSelected">): string {
  return "";
}

function turnSummary(node: TurnNode): string {
  if (node.failure) return `agent: ${node.status}: ${truncate(node.failure)}`;

  const text = node.agentParts.join(" ").replace(/\s+/g, " ").trim();
  if (!text) return "agent: no assistant summary";
  return `agent: ${truncate(text, AGENT_SUMMARY_MAX_LENGTH)}`;
}

function nearestTurnAncestor(
  entries: readonly PicoThreadEntry[],
  entryId: string | null,
): string | undefined {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  let current = entryId;

  while (current) {
    if (seen.has(current)) return undefined;
    seen.add(current);

    const entry = byId.get(current);
    if (!entry) return undefined;
    if (entryUserText(entry)) return entry.id;
    current = entry.parentId;
  }

  return undefined;
}

function turnIdForEntry(
  entries: readonly PicoThreadEntry[],
  entryId: string,
): string | undefined {
  const entry = entries.find((candidate) => candidate.id === entryId);
  if (!entry) return undefined;
  if (entryUserText(entry)) return entry.id;
  return nearestTurnAncestor(entries, entry.parentId);
}

function nearestTurnId(
  path: readonly PicoThreadEntry[],
  _entryToTurn: Map<string, string>,
): string | undefined {
  for (const entry of path.toReversed()) {
    if (entryUserText(entry)) return entry.id;
  }
  return undefined;
}

function treePrefix(ancestorLasts: readonly boolean[]): string {
  return ancestorLasts.map((isLast) => (isLast ? "    " : "│   ")).join("");
}

function truncate(value: string, maxLength = 72): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}
