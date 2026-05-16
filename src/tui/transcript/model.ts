import type { DraftAppState } from "../../app/controller";
import type { ThreadItem } from "@pico/codex-app-server-protocol/v2";
import { entryUserText, type PicoThreadStore } from "../../thread/store";
import {
  assistantMarkdownCell,
  fileChangeCell,
  systemNoticeCell,
  userMessageCell,
  type TranscriptCell,
  type TranscriptToolBlock,
} from "./cell";
import { transcriptCellsForResponseItem } from "./response-item";
import { threadItemToTranscriptCells } from "./thread-item";

export function buildTranscriptCells(
  store: PicoThreadStore,
  leafId = store.leafId,
): TranscriptCell[] {
  const cells: TranscriptCell[] = [];
  const pendingCalls = new Map<string, number>();
  let currentUserCellIndex: number | undefined;
  for (const entry of store.getPathEntries(leafId)) {
    const userText = entryUserText(entry);
    if (userText) {
      pendingCalls.clear();
      const pico = entry.type === "response_item"
        ? (entry.payload as Record<string, unknown> | undefined)?.pico as Record<string, unknown> | undefined
        : undefined;
      const status = pico?.status === "started" ? "started" : "completed";
      cells.push(userMessageCell(entry.id, userText, status));
      currentUserCellIndex = cells.length - 1;
      continue;
    }
    if (entry.type === "branch_out") continue;
    if (entry.type === "response_item") {
      appendTranscriptCells(cells, pendingCalls, transcriptCellsForResponseItem(entry.id, entry.payload as Record<string, unknown>));
      continue;
    }
    if (entry.type === "event_msg" && entry.payload && typeof entry.payload === "object") {
      const event = entry.payload as Record<string, unknown>;
      if (event.type === "turn_completed" && currentUserCellIndex !== undefined) {
        cells[currentUserCellIndex] = { ...cells[currentUserCellIndex], status: "completed" };
        continue;
      }
      if (event.type === "turn_failed") {
        if (currentUserCellIndex !== undefined) {
          cells[currentUserCellIndex] = { ...cells[currentUserCellIndex], status: "failed" };
        }
        cells.push(systemNoticeCell(entry.id, String(event.error || "Turn failed"), "failed"));
        continue;
      }
      if (event.type === "turn_aborted") {
        if (currentUserCellIndex !== undefined) {
          cells[currentUserCellIndex] = { ...cells[currentUserCellIndex], status: "aborted" };
        }
        cells.push(systemNoticeCell(entry.id, String(event.reason || "Turn aborted"), "aborted"));
      }
      if (event.type === "file_change") {
        const path = typeof event.path === "string" ? event.path : undefined;
        const diff = typeof event.diff === "string" ? event.diff : undefined;
        if (diff) {
          cells.push(fileChangeCell(entry.id, { path, diff, summary: undefined }));
        }
      }
    }
  }
  return cells;
}

export function buildTranscriptCellsWithLive(
  app: DraftAppState,
  streamingText: string,
  liveLeafId?: string,
  liveThreadItems?: readonly ThreadItem[],
): TranscriptCell[] {
  const cells = app.store ? buildTranscriptCells(app.store, liveLeafId || app.store.leafId) : [];
  if (liveThreadItems) {
    for (const item of liveThreadItems) {
      cells.push(...threadItemToTranscriptCells(item.id, item));
    }
  }
  if (streamingText.length > 0) {
    cells.push(assistantMarkdownCell("live", streamingText, { streaming: true }));
  }
  return cells;
}

function appendTranscriptCells(
  cells: TranscriptCell[],
  pendingCalls: Map<string, number>,
  nextCells: readonly TranscriptCell[],
): void {
  for (const cell of nextCells) {
    if (mergeToolOutputCell(cells, pendingCalls, cell)) continue;

    const callId = pendingCallId(cell);
    if (callId) pendingCalls.set(callId, cells.length);
    cells.push(cell);
  }
}

function mergeToolOutputCell(
  cells: TranscriptCell[],
  pendingCalls: Map<string, number>,
  cell: TranscriptCell,
): boolean {
  if (cell.kind !== "tool_output") return false;

  const outputBlock = cell.blocks.find((block): block is TranscriptToolBlock => block.type === "tool");
  const callId = outputBlock?.payload.callId;
  if (!callId) return false;

  const targetIndex = pendingCalls.get(callId);
  if (targetIndex === undefined) return false;

  const target = cells[targetIndex];
  const merged = mergeOutputIntoCell(target, outputBlock.payload.body, outputBlock.payload.status || cell.status);
  if (!merged) return false;

  cells[targetIndex] = merged;
  return true;
}

function mergeOutputIntoCell(
  cell: TranscriptCell,
  output: string | undefined,
  status: string | undefined,
): TranscriptCell | undefined {
  if (!output) return undefined;
  const [firstBlock, ...restBlocks] = cell.blocks;
  if (!firstBlock) return undefined;

  if (firstBlock.type === "tool") {
    return {
      ...cell,
      status: status || cell.status,
      blocks: [
        {
          ...firstBlock,
          payload: {
            ...firstBlock.payload,
            body: appendText(firstBlock.payload.body, output),
            output: true,
            status: status || firstBlock.payload.status,
          },
        },
        ...restBlocks,
      ],
    };
  }

  if (firstBlock.type === "command") {
    return {
      ...cell,
      status: status || cell.status,
      blocks: [
        {
          ...firstBlock,
          payload: {
            ...firstBlock.payload,
            output: appendText(firstBlock.payload.output, output),
            status: status || firstBlock.payload.status,
          },
        },
        ...restBlocks,
      ],
    };
  }

  return undefined;
}

function pendingCallId(cell: TranscriptCell): string | undefined {
  const block = cell.blocks[0];
  if (!block) return undefined;
  if (cell.kind === "tool_call" && block.type === "tool") return block.payload.callId;
  if (cell.kind === "command" && block.type === "command") return block.payload.callId;
  return undefined;
}

function appendText(existing: string | undefined, next: string): string {
  return existing ? `${existing}\n${next}` : next;
}
