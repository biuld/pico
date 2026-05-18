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
      const output = item.aggregatedOutput || undefined;
      const cell = commandCell(id, item.command, output);
      return [cell];
    }

    case "fileChange": {
      const cells: TranscriptCell[] = [];
      for (const change of item.changes) {
        cells.push(fileChangeCell(`${id}_${change.path}`, {
          path: change.path,
          diff: change.diff,
        }));
      }
      return cells;
    }

    case "mcpToolCall": {
      const label = `${item.server}/${item.tool}`;
      const status = toolStatusTone(item.status);
      return [toolCallCell(id, label, undefined, status, undefined, undefined, {
        argsPreview: anyPreview(item.arguments, 200),
        resultPreview: resultPreview(item.result),
        errorMessage: errorMessage(item.error),
        durationMs: item.durationMs,
      })];
    }

    case "dynamicToolCall": {
      const label = item.namespace
        ? `${item.namespace}/${item.tool}`
        : item.tool;
      const status = toolStatusTone(item.status);
      return [toolCallCell(id, label, undefined, status, undefined, undefined, {
        argsPreview: anyPreview(item.arguments, 200),
        resultPreview: resultPreview(item.contentItems),
        durationMs: item.durationMs,
      })];
    }

    case "webSearch": {
      const query = truncate(item.query, 120);
      return [toolCallCell(id, "web_search", query)];
    }

    case "imageGeneration": {
      const prompt = truncate(item.revisedPrompt || item.result, 120);
      return [toolCallCell(id, "image_generation", prompt)];
    }

    case "imageView": {
      return [toolCallCell(id, "image_view", String(item.path))];
    }

    case "enteredReviewMode":
    case "exitedReviewMode":
      return [systemNoticeCell(id, `review: ${item.review}`)];

    case "contextCompaction":
      return [systemNoticeCell(id, "Context compacted", "compaction")];

    case "collabAgentToolCall": {
      const c = item as unknown as { tool: string; prompt: string | null; status: string; durationMs: number | null };
      return [toolCallCell(id, `collab:${c.tool}`, undefined, toolStatusTone(c.status), undefined, undefined, {
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
