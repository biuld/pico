import type { DraftAppState } from "../../app/controller";
import type { ThreadItem, Turn } from "@pico/codex-app-server-protocol/v2";
import { CodexThreadViewState } from "../../app/codex-thread-view-state";
import {
  assistantMarkdownCell,
  commandCell,
  fileChangeCell,
  planUpdateCell,
  reasoningCell,
  userMessageCell,
  type TranscriptCell,
} from "./cell";
import { threadItemToTranscriptCells } from "./thread-item";

export function buildTranscriptCells(
  viewState: CodexThreadViewState,
  turnIndex?: number,
): TranscriptCell[] {
  const cells: TranscriptCell[] = [];

  // Always render cached turns first
  const turns = viewState.turns;
  const startIdx = turnIndex !== undefined ? turnIndex : 0;
  const endIdx = turnIndex !== undefined ? turnIndex + 1 : turns.length;

  for (let i = startIdx; i < endIdx && i < turns.length; i++) {
    const turn = turns[i];
    for (const item of turn.items) {
      cells.push(...threadItemToTranscriptCells(item.id, item));
    }
  }

  // Append live user input first (before live items and streaming)
  if (viewState.liveUserInput) {
    cells.push(userMessageCell("live-user", viewState.liveUserInput, "started"));
  }

  // Append live turn items
  let hasLiveAgentMessage = false;
  const renderedLiveCommandOutputIds = new Set<string>();
  for (const item of viewState.liveTurnItems) {
    if (item.type === "commandExecution" && viewState.liveCommandOutputs.has(item.id)) {
      const output = viewState.liveCommandOutputs.get(item.id);
      renderedLiveCommandOutputIds.add(item.id);
      cells.push(commandCell({
        id: item.id,
        command: item.command,
        cwd: item.cwd as string | undefined,
        output,
        status: "running",
      }));
      continue;
    }
    cells.push(...threadItemToTranscriptCells(item.id, item));
    if (item.type === "agentMessage") hasLiveAgentMessage = true;
  }

  // Live reasoning text (before streaming assistant, because it's different content)
  if (viewState.liveReasoningText) {
    cells.push(reasoningCell("live-reasoning", viewState.liveReasoningText));
  }

  // Live command outputs (keyed by itemId)
  // Look up the real command text from live items so the header shows the
  // actual command rather than a placeholder.
  const liveCommandLookup = new Map<string, { command: string; cwd?: string }>();
  for (const item of viewState.liveTurnItems) {
    if (item.type === "commandExecution") {
      liveCommandLookup.set(item.id, { command: item.command, cwd: item.cwd as string | undefined });
    }
  }
  for (const [itemId, output] of viewState.liveCommandOutputs) {
    if (renderedLiveCommandOutputIds.has(itemId)) continue;
    const info = liveCommandLookup.get(itemId);
    cells.push(commandCell({
      id: `live-cmd-${itemId}`,
      command: info?.command ?? "command",
      cwd: info?.cwd,
      output,
      status: "running",
    }));
  }

  // Live plan update (from turn/planUpdated)
  if (viewState.livePlan) {
    const steps = viewState.livePlan.steps.map((s) => ({
      step: s.step,
      status: s.status === "inProgress" ? "in_progress" as const
            : s.status === "completed" ? "completed" as const
            : "pending" as const,
    }));
    cells.push(planUpdateCell("live-plan", {
      explanation: viewState.livePlan.explanation ?? undefined,
      steps,
    }));
  }

  // Live file changes
  for (const [, changes] of viewState.liveFileChanges) {
    for (const change of changes) {
      const kind = typeof change.kind === "object" && change.kind && "type" in change.kind
        ? (change.kind as { type: string }).type
        : undefined;
      cells.push(fileChangeCell(`live-file-${change.path}`, {
        path: change.path,
        diff: change.diff,
        kind,
      }));
    }
  }

  // Append streaming assistant text — but skip if a completed agentMessage
  // already arrived (avoids showing both streaming and complete duplicate).
  if (viewState.streamingText && !hasLiveAgentMessage) {
    cells.push(assistantMarkdownCell("live", viewState.streamingText, { streaming: true }));
  }

  return cells;
}

export function buildTranscriptCellsWithLive(
  app: DraftAppState,
  streamingText: string,
  _liveThreadItems?: readonly ThreadItem[],
): TranscriptCell[] {
  const viewState = app.viewState;
  if (!viewState) return [];

  const cells = buildTranscriptCells(viewState);

  // Ensure streaming text is appended if not already handled
  if (streamingText.length > 0 && !viewState.streamingText) {
    cells.push(assistantMarkdownCell("live", streamingText, { streaming: true }));
  }

  return cells;
}
