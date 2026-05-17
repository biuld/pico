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
      const detail = buildToolDetail(item.arguments, item.result, item.error, item.durationMs);
      const status = toolStatusTone(item.status);
      return [toolCallCell(id, label, detail, status)];
    }

    case "dynamicToolCall": {
      const label = item.namespace
        ? `${item.namespace}/${item.tool}`
        : item.tool;
      const detail = buildToolDetail(item.arguments, item.contentItems, null, item.durationMs);
      const status = toolStatusTone(item.status);
      return [toolCallCell(id, label, detail, status)];
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
      return [toolCallCell(id, `collab:${c.tool}`, truncate(c.prompt ?? "", 120), toolStatusTone(c.status))];
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

function buildToolDetail(
  args: unknown,
  result: unknown,
  error: unknown,
  durationMs: number | null | undefined,
): string {
  const parts: string[] = [];

  // Args preview
  if (args !== undefined && args !== null) {
    const argsStr = typeof args === "string" ? args : JSON.stringify(args);
    parts.push(truncate(argsStr, 200));
  }

  // Result or error
  if (error !== undefined && error !== null) {
    const errStr = typeof error === "string" ? error
      : (error as Record<string, unknown>).message as string | undefined
      ?? JSON.stringify(error);
    parts.push(`error: ${truncate(errStr, 160)}`);
  } else if (result !== undefined && result !== null) {
    const resultStr = typeof result === "string" ? result : JSON.stringify(result);
    if (resultStr.length > 0 && resultStr !== "{}" && resultStr !== "null") {
      parts.push(`result: ${truncate(resultStr, 160)}`);
    }
  }

  // Duration
  if (typeof durationMs === "number") {
    parts.push(`${durationMs}ms`);
  }

  return parts.join(" · ");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength - 3) + "...";
}
