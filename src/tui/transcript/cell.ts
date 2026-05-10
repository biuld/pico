export type TranscriptCellKind =
  | "user_message"
  | "assistant_markdown"
  | "reasoning"
  | "tool_call"
  | "tool_output"
  | "command"
  | "file_change"
  | "system_notice";

export type TranscriptTone = "normal" | "muted" | "strong" | "status" | "error";

export type TranscriptBlock =
  | TranscriptMarkdownBlock
  | TranscriptTextBlock
  | TranscriptReasoningBlock
  | TranscriptToolBlock
  | TranscriptCommandBlock
  | TranscriptFileChangeBlock;

export interface TranscriptMarkdownBlock {
  type: "markdown";
  payload: {
    text: string;
    streaming?: boolean;
  };
}

export interface TranscriptTextBlock {
  type: "text";
  payload: {
    text: string;
    tone?: TranscriptTone;
  };
}

export interface TranscriptReasoningBlock {
  type: "reasoning";
  payload: {
    text: string;
  };
}

export interface TranscriptToolBlock {
  type: "tool";
  payload: {
    label: string;
    detail?: string;
    body?: string;
    status?: string;
    output?: boolean;
  };
}

export interface TranscriptCommandBlock {
  type: "command";
  payload: {
    command: string;
    output?: string;
    status?: string;
  };
}

export interface TranscriptFileChangeBlock {
  type: "file_change";
  payload: {
    path?: string;
    summary?: string;
    diff?: string;
  };
}

export interface TranscriptCell {
  id: string;
  kind: TranscriptCellKind;
  status?: string;
  blocks: readonly TranscriptBlock[];
}

export function userMessageCell(
  id: string,
  text: string,
  status?: string,
): TranscriptCell {
  return {
    id,
    kind: "user_message",
    status,
    blocks: [{ type: "text", payload: { text: text.trimEnd(), tone: "strong" } }],
  };
}

export function assistantMarkdownCell(
  id: string,
  text: string,
  options: { streaming?: boolean; status?: string } = {},
): TranscriptCell {
  return {
    id,
    kind: "assistant_markdown",
    status: options.status,
    blocks: [{ type: "markdown", payload: { text, streaming: options.streaming } }],
  };
}

export function reasoningCell(
  id: string,
  text: string,
  status?: string,
): TranscriptCell {
  return {
    id,
    kind: "reasoning",
    status,
    blocks: [{ type: "reasoning", payload: { text } }],
  };
}

export function toolCallCell(
  id: string,
  label: string,
  detail?: string,
  status?: string,
): TranscriptCell {
  return {
    id,
    kind: "tool_call",
    status,
    blocks: [{ type: "tool", payload: { label, detail, status } }],
  };
}

export function toolOutputCell(
  id: string,
  label: string,
  body?: string,
  status?: string,
): TranscriptCell {
  return {
    id,
    kind: "tool_output",
    status,
    blocks: [{ type: "tool", payload: { label, body, status, output: true } }],
  };
}

export function commandCell(
  id: string,
  command: string,
  output?: string,
  status?: string,
): TranscriptCell {
  return {
    id,
    kind: "command",
    status,
    blocks: [{ type: "command", payload: { command, output, status } }],
  };
}

export function fileChangeCell(
  id: string,
  payload: TranscriptFileChangeBlock["payload"],
  status?: string,
): TranscriptCell {
  return {
    id,
    kind: "file_change",
    status,
    blocks: [{ type: "file_change", payload }],
  };
}

export function systemNoticeCell(
  id: string,
  text: string,
  status?: string,
): TranscriptCell {
  return {
    id,
    kind: "system_notice",
    status,
    blocks: [
      {
        type: "text",
        payload: { text, tone: status === "failed" ? "error" : "muted" },
      },
    ],
  };
}

export function blockText(block: TranscriptBlock): string {
  switch (block.type) {
    case "markdown":
    case "text":
    case "reasoning":
      return block.payload.text;
    case "tool":
      return [block.payload.label, block.payload.detail, block.payload.body]
        .filter(Boolean)
        .join("\n");
    case "command":
      return [block.payload.command, block.payload.output].filter(Boolean).join("\n");
    case "file_change":
      return [block.payload.path || block.payload.summary, block.payload.diff]
        .filter(Boolean)
        .join("\n");
  }
}
