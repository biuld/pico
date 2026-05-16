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
      const args = typeof item.arguments === "string"
        ? item.arguments
        : JSON.stringify(item.arguments);
      return [toolCallCell(id, label, args)];
    }

    case "dynamicToolCall": {
      const label = item.namespace
        ? `${item.namespace}/${item.tool}`
        : item.tool;
      const args = typeof item.arguments === "string"
        ? item.arguments
        : JSON.stringify(item.arguments);
      return [toolCallCell(id, label, args)];
    }

    case "webSearch":
      return [toolCallCell(id, "web_search", item.query)];

    case "imageGeneration":
      return [toolCallCell(id, "image_generation", item.revisedPrompt || item.result)];

    case "imageView":
      return [toolCallCell(id, "image_view", String(item.path))];

    case "enteredReviewMode":
    case "exitedReviewMode":
      return [systemNoticeCell(id, `review: ${item.review}`)];

    case "contextCompaction":
    case "hookPrompt":
    case "collabAgentToolCall":
      return [];

    default:
      return [];
  }
}
