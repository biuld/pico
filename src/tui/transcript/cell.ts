import type { TranscriptRow, TranscriptRowKind } from "./model";

export type TranscriptCellKind = TranscriptRowKind;

export type TranscriptTone = "normal" | "muted" | "strong" | "status";

export const TRANSCRIPT_TEXT_BLOCK = "text";

export interface TranscriptBlock<TPayload = unknown> {
  type: string;
  payload: TPayload;
}

export interface TranscriptTextPayload {
  text: string;
}

export interface TranscriptCell {
  id: string;
  kind: TranscriptCellKind;
  status?: string;
  blocks: readonly TranscriptBlock[];
}

export function transcriptCellsFromRows(rows: readonly TranscriptRow[]): TranscriptCell[] {
  return rows.map(transcriptCellFromRow);
}

export function transcriptCellFromRow(row: TranscriptRow): TranscriptCell {
  return {
    id: row.id,
    kind: row.kind || row.role,
    status: row.status,
    blocks: [textTranscriptBlock(transcriptRowText(row))],
  };
}

export function textTranscriptBlock(text: string): TranscriptBlock<TranscriptTextPayload> {
  return {
    type: TRANSCRIPT_TEXT_BLOCK,
    payload: { text },
  };
}

export function isTextTranscriptBlock(
  block: TranscriptBlock,
): block is TranscriptBlock<TranscriptTextPayload> {
  return block.type === TRANSCRIPT_TEXT_BLOCK && isTranscriptTextPayload(block.payload);
}

function transcriptRowText(row: TranscriptRow): string {
  return row.role === "user" ? row.text.trimEnd() : row.text;
}

function isTranscriptTextPayload(payload: unknown): payload is TranscriptTextPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { text?: unknown }).text === "string"
  );
}
