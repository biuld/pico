import type { ThreadItem } from "@pico/codex-app-server-protocol/v2";
import type { FileUpdateChange } from "@pico/codex-app-server-protocol/v2";
import {
  assistantMarkdownCell,
  commandCell,
  fileChangeCell,
  reasoningCell,
  systemNoticeCell,
  toolCallCell,
  userMessageCell,
  type TranscriptCell,
} from "./cell";

export function threadItemToTranscriptCells(id: string, item: ThreadItem): TranscriptCell[] {
  switch (item.type) {
    case "userMessage": {
      const text = item.content
        .map((p) => (typeof p === "object" && p && "text" in p ? (p as { text: string }).text : ""))
        .filter(Boolean)
        .join(" ");
      return text ? [userMessageCell(id, text)] : [];
    }

    case "agentMessage":
      return item.text ? [assistantMarkdownCell(id, item.text)] : [];

    case "reasoning": {
      const text = item.summary.join("\n") || item.content.join("\n");
      return text ? [reasoningCell(id, text)] : [];
    }

    case "plan":
      return item.text ? [assistantMarkdownCell(id, item.text)] : [];

    case "commandExecution": {
      return [commandCell({
        id,
        command: item.command,
        cwd: item.cwd as string | undefined,
        output: item.aggregatedOutput || undefined,
        status: item.status as string | undefined,
        exitCode: item.exitCode,
        durationMs: item.durationMs,
      })];
    }

    case "fileChange": {
      const cells: TranscriptCell[] = [];
      for (const change of item.changes) {
        const kind = typeof change.kind === "object" && change.kind && "type" in change.kind
          ? (change.kind as { type: string }).type
          : undefined;
        cells.push(fileChangeCell(`${id}_${change.path}`, {
          path: change.path,
          diff: change.diff,
          kind,
          status: item.status as string | undefined,
        }));
      }
      return cells;
    }

    case "mcpToolCall": {
      return [toolCallCell({
        id,
        label: `${item.server}/${item.tool}`,
        status: toolStatusTone(item.status),
        argsPreview: anyPreview(item.arguments, 200),
        resultPreview: resultPreview(item.result),
        errorMessage: errorMessage(item.error),
        durationMs: item.durationMs,
      })];
    }

    case "dynamicToolCall": {
      return [toolCallCell({
        id,
        label: item.namespace ? `${item.namespace}/${item.tool}` : item.tool,
        status: toolStatusTone(item.status),
        argsPreview: anyPreview(item.arguments, 200),
        resultPreview: resultPreview(item.contentItems),
        durationMs: item.durationMs,
      })];
    }

    case "webSearch":
      return [toolCallCell({ id, label: "web_search", detail: truncate(item.query, 120) })];

    case "imageGeneration":
      return [toolCallCell({ id, label: "image_generation", detail: truncate(item.revisedPrompt || item.result, 120) })];

    case "imageView":
      return [toolCallCell({ id, label: "image_view", detail: String(item.path) })];

    case "enteredReviewMode":
    case "exitedReviewMode":
      return [systemNoticeCell(id, `review: ${item.review}`)];

    case "contextCompaction":
      return [systemNoticeCell(id, "Context compacted", "compaction")];

    case "collabAgentToolCall": {
      const c = item as unknown as { tool: string; prompt: string | null; status: string; durationMs: number | null };
      return [toolCallCell({
        id,
        label: `collab:${c.tool}`,
        status: toolStatusTone(c.status),
        argsPreview: truncate(c.prompt ?? "", 200),
        durationMs: c.durationMs,
      })];
    }

    case "hookPrompt":
      return [];

    default:
      // Unknown item types show a muted notice so nothing is silently lost
      return [systemNoticeCell(id, `item: ${(item as { type: string }).type}`, "muted")];
  }
}

// ── Tool rendering helpers ──

function toolStatusTone(status: string): string | undefined {
  switch (status) {
    case "failed":
    case "error":
    case "declined":
    case "cancelled":
      return "failed";
    case "inProgress":
    case "running":
      return "running";
    default:
      return undefined;
  }
}

function anyPreview(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (str.length === 0 || str === "{}" || str === "null") return undefined;
  return truncate(str, maxLength);
}

function resultPreview(result: unknown): string | undefined {
  return anyPreview(result, 160);
}

function errorMessage(error: unknown): string | undefined {
  if (error === undefined || error === null) return undefined;
  if (typeof error === "string") return truncate(error, 160);
  const msg = (error as Record<string, unknown>).message;
  return typeof msg === "string" ? truncate(msg, 160) : truncate(JSON.stringify(error), 160);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength - 3) + "...";
}
