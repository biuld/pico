import type { TranscriptCell } from "./cell";
import { blockText } from "./cell";

export function exportTranscriptToMarkdown(cells: readonly TranscriptCell[]): string {
  const parts: string[] = [];
  for (const cell of cells) {
    const label = cellKindLabel(cell.kind);
    const body = cell.blocks.map((b) => blockText(b)).filter(Boolean).join("\n\n");
    if (!body.trim()) continue;
    if (label) parts.push(`## ${label}\n\n${body}`);
    else parts.push(body);
  }
  return parts.join("\n\n");
}

function cellKindLabel(kind: string): string {
  switch (kind) {
    case "user_message": return "User";
    case "assistant_markdown": return "Assistant";
    case "reasoning": return "Reasoning";
    case "command": return "Command";
    case "file_change": return "File Change";
    case "tool_call": return "Tool Call";
    case "tool_output": return "Tool Output";
    case "system_notice": return "System";
    default: return "";
  }
}

export function exportTranscriptToHtml(cells: readonly TranscriptCell[]): string {
  const md = exportTranscriptToMarkdown(cells);
  const htmlBody = md
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^>(.+)$/gm, "<blockquote>$1</blockquote>");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Pico Transcript Export</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; line-height: 1.6; color: #1a1a1a; }
    h2 { margin-top: 1.5rem; border-bottom: 1px solid #e5e5e5; padding-bottom: 0.25rem; }
    pre { background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto; }
    code { background: #f5f5f5; padding: 0.2em 0.4em; border-radius: 3px; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 3px solid #ddd; margin: 0; padding-left: 1rem; color: #666; }
  </style>
</head>
<body>
  <p>${htmlBody}</p>
</body>
</html>`;
}
