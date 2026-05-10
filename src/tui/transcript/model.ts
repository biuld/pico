import type { DraftAppState } from "../../app/controller";
import type { PicoThreadStore } from "../../thread/store";
import {
  assistantMarkdownCell,
  systemNoticeCell,
  userMessageCell,
  type TranscriptCell,
  type TranscriptToolBlock,
} from "./cell";
import { transcriptCellsForResponseItem } from "./response-item";

export function buildTranscriptCells(
  store: PicoThreadStore,
  leafId = store.leafId,
): TranscriptCell[] {
  const cells: TranscriptCell[] = [];
  const pendingCalls = new Map<string, number>();
  for (const entry of store.getPathEntries(leafId)) {
    if (entry.type === "turn") {
      pendingCalls.clear();
      cells.push(userMessageCell(entry.id, entry.userInput, entry.status));
      continue;
    }
    if (entry.type === "response_item") {
      appendTranscriptCells(cells, pendingCalls, transcriptCellsForResponseItem(entry.id, entry.responseItem));
      continue;
    }
    if (entry.type === "turn_failed") {
      cells.push(systemNoticeCell(entry.id, entry.error, "failed"));
      continue;
    }
    if (entry.type === "turn_aborted") {
      cells.push(systemNoticeCell(entry.id, entry.reason || "Turn aborted", "aborted"));
    }
  }
  return cells;
}

export function buildTranscriptCellsWithLive(
  app: DraftAppState,
  streamingText: string,
  liveLeafId?: string,
): TranscriptCell[] {
  const cells = app.store ? buildTranscriptCells(app.store, liveLeafId || app.store.leafId) : [];
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
