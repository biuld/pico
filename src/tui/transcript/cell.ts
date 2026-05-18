export type TranscriptCellKind =
  | "user_message"
  | "assistant_markdown"
  | "reasoning"
  | "plan_update"
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
  | TranscriptPlanBlock
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

export type TranscriptPlanStepStatus = "pending" | "in_progress" | "completed";

export interface TranscriptPlanStep {
  step: string;
  status: TranscriptPlanStepStatus;
}

export interface TranscriptPlanBlock {
  type: "plan";
  payload: {
    explanation?: string;
    steps: TranscriptPlanStep[];
  };
}

export interface TranscriptToolBlock {
  type: "tool";
  payload: {
    label?: string;
    /** Deprecated: kept for backward compat. Prefer structured fields below. */
    detail?: string;
    argsPreview?: string;
    resultPreview?: string;
    errorMessage?: string;
    durationMs?: number | null;
    body?: string;
    diff?: string;
    status?: string;
    output?: boolean;
    callId?: string;
  };
}

export interface TranscriptCommandBlock {
  type: "command";
  payload: {
    command: string;
    output?: string;
    status?: string;
    callId?: string;
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

export function planUpdateCell(
  id: string,
  payload: TranscriptPlanBlock["payload"],
  status?: string,
): TranscriptCell {
  return {
    id,
    kind: "plan_update",
    status,
    blocks: [{ type: "plan", payload }],
  };
}

export function toolCallCell(
  id: string,
  label: string,
  detail?: string,
  status?: string,
  callId?: string,
  diff?: string,
  opts?: { argsPreview?: string; resultPreview?: string; errorMessage?: string; durationMs?: number | null },
): TranscriptCell {
  return {
    id,
    kind: "tool_call",
    status,
    blocks: [{
      type: "tool",
      payload: {
        label, detail, status, callId, diff,
        argsPreview: opts?.argsPreview,
        resultPreview: opts?.resultPreview,
        errorMessage: opts?.errorMessage,
        durationMs: opts?.durationMs,
      },
    }],
  };
}

export function toolOutputCell(
  id: string,
  body?: string,
  status?: string,
  callId?: string,
): TranscriptCell {
  return {
    id,
    kind: "tool_output",
    status,
    blocks: [{ type: "tool", payload: { body, status, output: true, callId } }],
  };
}

export function commandCell(
  id: string,
  command: string,
  output?: string,
  status?: string,
  callId?: string,
): TranscriptCell {
  return {
    id,
    kind: "command",
    status,
    blocks: [{ type: "command", payload: { command, output, status, callId } }],
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
    case "plan":
      return [
        "Updated Plan",
        block.payload.explanation,
        ...(block.payload.steps.length > 0
          ? block.payload.steps.map((step) => `${planStepMarker(step.status)} ${step.step}`)
          : ["(no steps provided)"]),
      ]
        .filter(Boolean)
        .join("\n");
    case "tool":
      return [block.payload.label, block.payload.detail, block.payload.body]
        .filter(Boolean)
        .join("\n");
    case "command":
      return [block.payload.command, block.payload.output].filter(Boolean).join("\n");
    case "file_change":
      return [block.payload.path || "file change", block.payload.summary]
        .filter(Boolean)
        .join("\n");
  }
}

function planStepMarker(status: TranscriptPlanStepStatus): string {
  switch (status) {
    case "completed":
      return "✓";
    case "in_progress":
    case "pending":
      return "□";
  }
}
