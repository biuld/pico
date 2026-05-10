import type { DraftAppState } from "../../app/controller";
import type { SessionStore } from "../../session/store";
import { transcriptRowsForResponseItem } from "./response-item";

export type TranscriptRole = "user" | "assistant" | "system";
export type TranscriptRowKind =
  | TranscriptRole
  | "reasoning"
  | "tool"
  | "command"
  | "file"
  | "plan";

export interface TranscriptRow {
  id: string;
  role: TranscriptRole;
  kind?: TranscriptRowKind;
  text: string;
  status?: string;
}

export function buildTranscriptRows(
  store: SessionStore,
  leafId = store.leafId,
): TranscriptRow[] {
  return store.getPathEntries(leafId).flatMap((entry): TranscriptRow[] => {
    if (entry.type === "turn") {
      return [{ id: entry.id, role: "user", text: entry.userInput, status: entry.status }];
    }
    if (entry.type === "response_item") {
      return transcriptRowsForResponseItem(entry.id, entry.responseItem);
    }
    if (entry.type === "turn_failed") {
      return [{ id: entry.id, role: "system", text: entry.error, status: "failed" }];
    }
    if (entry.type === "turn_aborted") {
      return [{ id: entry.id, role: "system", text: entry.reason || "Turn aborted", status: "aborted" }];
    }
    return [];
  });
}

export function buildTranscriptRowsWithLive(
  app: DraftAppState,
  streamingText: string,
  liveStatus = "",
  liveLeafId?: string,
): TranscriptRow[] {
  const rows = app.store ? buildTranscriptRows(app.store, liveLeafId || app.store.leafId) : [];
  if (streamingText.length > 0) {
    rows.push({ id: "live", role: "assistant", text: streamingText });
  } else if (liveStatus.length > 0) {
    rows.push({
      id: "live-loading",
      role: "assistant",
      kind: "reasoning",
      text: liveStatus,
      status: "running",
    });
  }
  return rows;
}
