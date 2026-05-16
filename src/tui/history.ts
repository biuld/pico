import type { CodexThreadViewState } from "../app/codex-thread-view-state";
import type { ThreadItem, Turn } from "@pico/codex-app-server-protocol/v2";

// ── Flat turn list (no tree, read-only) ──

export interface HistoryTurnRow {
  id: string;
  turnIndex: number;
  isActive: boolean;
  isSelected: boolean;
  userText: string;
  agentSummary: string;
  status: "completed" | "aborted" | "failed" | "running";
}

export function buildHistoryTurnRows(
  viewState: CodexThreadViewState,
  selectedTurnIndex?: number,
): HistoryTurnRow[] {
  const turns = viewState.turns;
  const sel = selectedTurnIndex ?? turns.length - 1;
  const rows: HistoryTurnRow[] = [];

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const userText = turnUserPreview(turn);
    const agentSummary = turnAgentSummary(turn);
    const status = turnDisplayStatus(turn);
    const isActive = i === turns.length - 1;
    const isSelected = i === sel;

    rows.push({
      id: turn.id,
      turnIndex: i,
      isActive,
      isSelected,
      userText: truncate(userText, 48),
      agentSummary: agentSummary ? `agent: ${truncate(stripMarkdown(agentSummary), 36)}` : "",
      status,
    });
  }

  // Running turn (not yet in cachedThread)
  if (viewState.turnStatus === "running" && viewState.liveTurnItems.length > 0) {
    const runningIndex = turns.length;
    rows.push({
      id: `running-${runningIndex}`,
      turnIndex: runningIndex,
      isActive: false,
      isSelected: runningIndex === sel,
      userText: "...",
      agentSummary: viewState.streamingText ? truncate(viewState.streamingText, 36) : "running...",
      status: "running",
    });
  }

  return rows;
}

export function historySelectionTargetId(viewState: CodexThreadViewState): string | undefined {
  const turns = viewState.turns;
  if (turns.length === 0) return undefined;
  return turns[turns.length - 1].id;
}

export function historySelectionTargetIndex(viewState: CodexThreadViewState): number {
  return Math.max(0, viewState.turns.length - 1);
}

export function formatHistoryTurnRow(row: HistoryTurnRow): string {
  const prefix = row.isActive ? "* " : "  ";
  const userLine = `${prefix}${row.userText || "(empty turn)"}`;
  const summaryLine = row.agentSummary
    ? `  ${row.agentSummary}`
    : "  (no response)";
  return `${userLine}\n${summaryLine}`;
}

// ── Helpers ──

function turnUserPreview(turn: Turn): string {
  const items = turn.items;
  if (!Array.isArray(items) || items.length === 0) return "";
  const first = items[0] as ThreadItem;
  if (first.type === "userMessage") {
    const msg = first as { type: "userMessage"; content: Array<{ type: string; text?: string }> };
    if (Array.isArray(msg.content)) {
      return msg.content
        .map((p) => (typeof p?.text === "string" ? p.text : ""))
        .filter(Boolean)
        .join(" ")
        .trim();
    }
  }
  return "";
}

function turnAgentSummary(turn: Turn): string {
  const items = turn.items;
  if (!Array.isArray(items)) return "";
  const texts: string[] = [];
  for (const item of items) {
    const it = item as ThreadItem;
    if (it.type === "agentMessage") {
      const msg = it as { type: "agentMessage"; text: string };
      if (typeof msg.text === "string") texts.push(msg.text);
    }
  }
  return texts.join(" ").trim();
}

function turnDisplayStatus(turn: Turn): HistoryTurnRow["status"] {
  const status = (turn.status as string) || "";
  if (status === "completed") return "completed";
  if (status === "aborted" || status === "interrupted") return "aborted";
  if (status === "failed") return "failed";
  return "running";
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[.*?\]\([^)]+\)/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength) + "...";
}
