/** @jsxImportSource @opentui/solid */
import { For } from "solid-js";
import { TextAttributes, type SyntaxStyle } from "@opentui/core";
import {
  type TranscriptBlock,
  type TranscriptCell,
  type TranscriptCommandBlock,
  type TranscriptFileChangeBlock,
  type TranscriptPlanBlock,
  type TranscriptPlanStepStatus,
  type TranscriptTextBlock,
  type TranscriptToolBlock,
} from "../../transcript";
import type { TuiTheme } from "../../theme";
import { SolidText } from "../solid-text";
import {
  compactTranscriptPreview,
  formatMainTranscriptOutputPreview,
  mainTranscriptMuteStrategyForCell,
  type MainTranscriptMuteStrategy,
} from "./preview";

export interface TranscriptCellViewProps {
  cell: TranscriptCell;
  index: number;
  theme: TuiTheme;
  syntaxStyle: SyntaxStyle;
}

export function TranscriptCellView(props: TranscriptCellViewProps) {
  const isUser = () => props.cell.kind === "user_message";

  return (
    <box
      id={`pico-transcript-cell-${safeId(props.cell.id)}-${props.index}`}
      width="100%"
      flexDirection="column"
      flexShrink={0}
      rowGap={0}
      paddingX={isUser() ? 1 : 0}
      paddingY={isUser() ? 1 : 0}
      backgroundColor={isUser() ? props.theme.colors.userMessageBackground : props.theme.colors.background}
    >
      <For each={props.cell.blocks}>
        {(block, blockIndex) => (
          <TranscriptBlockView
            cell={props.cell}
            block={block}
            blockIndex={blockIndex()}
            theme={props.theme}
            syntaxStyle={props.syntaxStyle}
          />
        )}
      </For>
    </box>
  );
}

interface TranscriptBlockViewProps {
  cell: TranscriptCell;
  block: TranscriptBlock;
  blockIndex: number;
  theme: TuiTheme;
  syntaxStyle: SyntaxStyle;
}

function TranscriptBlockView(props: TranscriptBlockViewProps) {
  const id = `pico-transcript-block-${safeId(props.cell.id)}-${props.blockIndex}`;
  const strategy = mainTranscriptMuteStrategyForCell(props.cell);
  switch (props.block.type) {
    case "markdown":
      return (
        <markdown
          id={id}
          width="100%"
          content={props.block.payload.text}
          syntaxStyle={props.syntaxStyle}
          fg={props.theme.colors.text}
          bg={props.theme.colors.background}
          conceal={true}
          concealCode={false}
          streaming={Boolean(props.block.payload.streaming)}
          internalBlockMode="top-level"
          tableOptions={{
            style: "columns",
            widthMode: "full",
            wrapMode: "word",
            borders: false,
            cellPadding: 0,
          }}
        />
      );
    case "reasoning":
      return (
        <ReasoningBlock
          id={id}
          text={props.block.payload.text}
          theme={props.theme}
          strategy={strategy}
        />
      );
    case "plan":
      return <PlanBlock id={id} block={props.block} theme={props.theme} />;
    case "text":
      return <TextBlock id={id} cell={props.cell} block={props.block} theme={props.theme} />;
    case "tool":
      return <ToolBlock id={id} block={props.block} theme={props.theme} strategy={strategy} syntaxStyle={props.syntaxStyle} />;
    case "command":
      return (
        <CommandBlock
          id={id}
          block={props.block}
          theme={props.theme}
          syntaxStyle={props.syntaxStyle}
          strategy={strategy}
        />
      );
    case "file_change":
      return (
        <FileChangeBlock
          id={id}
          block={props.block}
          theme={props.theme}
          syntaxStyle={props.syntaxStyle}
          strategy={strategy}
        />
      );
  }
}

function ReasoningBlock(props: {
  id: string;
  text: string;
  theme: TuiTheme;
  strategy: MainTranscriptMuteStrategy;
}) {
  const content = props.strategy === "expanded"
    ? props.text
    : compactTranscriptPreview(props.text, 160);
  return <MutedText id={props.id} text={`• ${content}`} theme={props.theme} />;
}

function PlanBlock(props: { id: string; block: TranscriptPlanBlock; theme: TuiTheme }) {
  return (
    <box
      id={props.id}
      width="100%"
      flexDirection="column"
      rowGap={0}
      backgroundColor={props.theme.colors.background}
    >
      <SolidText
        id={`${props.id}-header`}
        width="100%"
        content="• Updated Plan"
        fg={props.theme.colors.textStrong}
        bg={props.theme.colors.background}
        attributes={TextAttributes.BOLD}
        wrapMode="word"
      />
      {props.block.payload.explanation ? (
        <SolidText
          id={`${props.id}-explanation`}
          width="100%"
          content={`  └ ${props.block.payload.explanation}`}
          fg={props.theme.colors.muted}
          bg={props.theme.colors.background}
          attributes={TextAttributes.DIM | TextAttributes.ITALIC}
          wrapMode="word"
        />
      ) : undefined}
      {props.block.payload.steps.length === 0 ? (
        <SolidText
          id={`${props.id}-empty`}
          width="100%"
          content="  └ (no steps provided)"
          fg={props.theme.colors.muted}
          bg={props.theme.colors.background}
          attributes={TextAttributes.DIM | TextAttributes.ITALIC}
          wrapMode="word"
        />
      ) : (
        <For each={props.block.payload.steps}>
          {(step, index) => (
            <PlanStep
              id={`${props.id}-step-${index()}`}
              prefix={index() === 0 && !props.block.payload.explanation ? "  └ " : "    "}
              status={step.status}
              text={step.step}
              theme={props.theme}
            />
          )}
        </For>
      )}
    </box>
  );
}

function TextBlock(props: {
  id: string;
  cell: TranscriptCell;
  block: TranscriptTextBlock;
  theme: TuiTheme;
}) {
  const prefix = props.cell.kind === "user_message" ? "› " : props.cell.status === "failed" ? "! " : "";
  const tone = props.block.payload.tone;
  return (
    <SolidText
      id={props.id}
      width="100%"
      content={`${prefix}${props.block.payload.text}`}
      fg={textColorForTone(tone, props.theme)}
      bg={props.cell.kind === "user_message"
        ? props.theme.colors.userMessageBackground
        : props.theme.colors.background}
      attributes={tone === "strong"
        ? TextAttributes.BOLD
        : tone === "muted"
          ? TextAttributes.DIM
          : TextAttributes.NONE}
      wrapMode="word"
    />
  );
}

function PlanStep(props: {
  id: string;
  prefix: string;
  status: TranscriptPlanStepStatus;
  text: string;
  theme: TuiTheme;
}) {
  const style = planStepStyle(props.status, props.theme);
  return (
    <box
      id={props.id}
      width="100%"
      flexDirection="row"
      flexShrink={0}
      rowGap={0}
      columnGap={0}
      backgroundColor={props.theme.colors.background}
    >
      <SolidText
        id={`${props.id}-prefix`}
        content={`${props.prefix}${planStepMarker(props.status)} `}
        fg={style.fg}
        bg={props.theme.colors.background}
        attributes={style.prefixAttributes}
        wrapMode="word"
      />
      <SolidText
        id={`${props.id}-text`}
        content={props.text}
        fg={style.fg}
        bg={props.theme.colors.background}
        attributes={style.textAttributes}
        wrapMode="word"
      />
    </box>
  );
}

export function buildToolHeader(
  payload: { label?: string; argsPreview?: string; resultPreview?: string; errorMessage?: string; durationMs?: number | null; detail?: string },
  showDetail: boolean,
): { text: string; hasError: boolean } {
  const parts: string[] = [payload.label ?? ""];
  let hasError = false;
  if (showDetail) {
    if (payload.argsPreview) parts.push(payload.argsPreview);
    if (payload.errorMessage) {
      hasError = true;
    } else if (payload.resultPreview) {
      parts.push(payload.resultPreview);
    }
    if (typeof payload.durationMs === "number") parts.push(`${payload.durationMs}ms`);
    if (!payload.argsPreview && !payload.errorMessage && !payload.resultPreview && payload.detail) {
      parts.push(payload.detail);
    }
  }
  return { text: parts.filter(Boolean).join(" · "), hasError };
}

function ToolBlock(props: {
  id: string;
  block: TranscriptToolBlock;
  theme: TuiTheme;
  strategy: MainTranscriptMuteStrategy;
  syntaxStyle?: SyntaxStyle;
}) {
  const showDetail = props.strategy === "expanded" || props.strategy === "tool-call-summary";
  const isFailed = props.block.payload.status === "failed";
  const groupBg = props.theme.colors.background;
  const headerColor = isFailed ? props.theme.colors.error : props.theme.colors.status;

  const { text: header, hasError } = buildToolHeader(props.block.payload, showDetail);

  return (
    <box
      id={props.id}
      width="100%"
      flexDirection="column"
      rowGap={0}
      backgroundColor={groupBg}
    >
      {header ? (
        <SolidText
          id={`${props.id}-header`}
          width="100%"
          content={`↳ ${header}`}
          fg={headerColor}
          bg={groupBg}
          wrapMode="word"
        />
      ) : undefined}
      {showDetail && hasError ? (
        <SolidText
          id={`${props.id}-error`}
          width="100%"
          content={`  ${props.block.payload.errorMessage}`}
          fg={props.theme.colors.error}
          bg={groupBg}
          wrapMode="word"
        />
      ) : undefined}
      {props.block.payload.diff &&
      (props.strategy === "expanded" || props.strategy === "tool-call-summary") ? (
        <PatchBlock
          id={`${props.id}-diff`}
          diff={props.block.payload.diff}
          theme={props.theme}
          syntaxStyle={props.syntaxStyle!}
        />
      ) : undefined}
      {props.block.payload.body && props.strategy === "expanded" ? (
        <MutedText
          id={`${props.id}-body`}
          text={props.block.payload.body}
          theme={props.theme}
          backgroundColor={groupBg}
        />
      ) : undefined}
      {props.block.payload.body &&
      (props.strategy === "tool-output-preview" || props.strategy === "tool-call-summary") ? (
        <MutedText
          id={`${props.id}-body-preview`}
          text={formatMainTranscriptOutputPreview(props.block.payload.body, {
            includeAnglePipe: Boolean(header),
            includePrefix: Boolean(header),
          })}
          theme={props.theme}
          backgroundColor={groupBg}
        />
      ) : undefined}
    </box>
  );
}

function CommandBlock(props: {
  id: string;
  block: TranscriptCommandBlock;
  theme: TuiTheme;
  syntaxStyle: SyntaxStyle;
  strategy: MainTranscriptMuteStrategy;
}) {
  return (
    <box
      id={props.id}
      width="100%"
      flexDirection="column"
      rowGap={0}
      backgroundColor={props.theme.colors.background}
    >
      <SolidText
        id={`${props.id}-header`}
        width="100%"
        content={`$ ${props.block.payload.command}`}
        fg={props.theme.colors.status}
        bg={props.theme.colors.background}
        wrapMode="word"
      />
      {props.block.payload.output && props.strategy === "expanded" ? (
        <code
          id={`${props.id}-output`}
          width="100%"
          content={props.block.payload.output}
          filetype="text"
          syntaxStyle={props.syntaxStyle}
          fg={props.theme.colors.muted}
          bg={props.theme.colors.background}
          wrapMode="word"
          conceal={false}
          drawUnstyledText={true}
        />
      ) : undefined}
      {props.block.payload.output && props.strategy === "command-output-preview" ? (
        <MutedText
          id={`${props.id}-output-preview`}
          text={formatMainTranscriptOutputPreview(props.block.payload.output, { includeAnglePipe: false })}
          theme={props.theme}
        />
      ) : undefined}
    </box>
  );
}

function FileChangeBlock(props: {
  id: string;
  block: TranscriptFileChangeBlock;
  theme: TuiTheme;
  syntaxStyle: SyntaxStyle;
  strategy: MainTranscriptMuteStrategy;
}) {
  const header = props.block.payload.path || props.block.payload.summary || "file change";
  return (
    <box
      id={props.id}
      width="100%"
      flexDirection="column"
      rowGap={0}
      backgroundColor={props.theme.colors.background}
    >
      <SolidText
        id={`${props.id}-header`}
        width="100%"
        content={`~ ${header}`}
        fg={props.theme.colors.status}
        bg={props.theme.colors.background}
        wrapMode="word"
      />
      {props.block.payload.summary && props.block.payload.summary !== header ? (
        <MutedText
          id={`${props.id}-summary`}
          text={`  ${props.block.payload.summary}`}
          theme={props.theme}
        />
      ) : undefined}
      {props.block.payload.diff && props.strategy === "expanded" ? (
        <PatchBlock
          id={`${props.id}-diff`}
          diff={props.block.payload.diff}
          theme={props.theme}
          syntaxStyle={props.syntaxStyle}
        />
      ) : undefined}
    </box>
  );
}

function PatchBlock(props: {
  id: string;
  diff: string;
  theme: TuiTheme;
  syntaxStyle: SyntaxStyle;
}) {
  if (looksLikeUnifiedDiff(props.diff)) {
    return (
      <diff
        id={props.id}
        width="100%"
        diff={props.diff}
        view="unified"
        syntaxStyle={props.syntaxStyle}
        fg={props.theme.colors.text}
        wrapMode="word"
        showLineNumbers={false}
        contextBg={props.theme.colors.background}
        lineNumberBg={props.theme.colors.background}
        lineNumberFg={props.theme.colors.muted}
      />
    );
  }

  return (
    <code
      id={props.id}
      width="100%"
      content={props.diff}
      filetype="diff"
      syntaxStyle={props.syntaxStyle}
      fg={props.theme.colors.muted}
      bg={props.theme.colors.background}
      wrapMode="word"
      conceal={false}
      drawUnstyledText={true}
    />
  );
}

function MutedText(props: {
  id: string;
  text: string;
  theme: TuiTheme;
  backgroundColor?: string;
}) {
  return (
    <SolidText
      id={props.id}
      width="100%"
      content={props.text}
      fg={props.theme.colors.muted}
      bg={props.backgroundColor || props.theme.colors.background}
      attributes={TextAttributes.DIM}
      wrapMode="word"
    />
  );
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

function planStepStyle(
  status: TranscriptPlanStepStatus,
  theme: TuiTheme,
): { fg: string; prefixAttributes: number; textAttributes: number } {
  switch (status) {
    case "completed":
      return {
        fg: theme.colors.muted,
        prefixAttributes: TextAttributes.DIM,
        textAttributes: TextAttributes.DIM | TextAttributes.STRIKETHROUGH,
      };
    case "in_progress":
      return {
        fg: theme.colors.status,
        prefixAttributes: TextAttributes.BOLD,
        textAttributes: TextAttributes.BOLD,
      };
    case "pending":
      return {
        fg: theme.colors.muted,
        prefixAttributes: TextAttributes.DIM,
        textAttributes: TextAttributes.DIM,
      };
  }
}

function textColorForTone(
  tone: TranscriptTextBlock["payload"]["tone"],
  theme: TuiTheme,
): string {
  switch (tone) {
    case "strong":
      return theme.colors.textStrong;
    case "muted":
      return theme.colors.muted;
    case "status":
      return theme.colors.status;
    case "error":
      return "#ef4444";
    default:
      return theme.colors.text;
  }
}

function looksLikeUnifiedDiff(text: string): boolean {
  return (
    text.startsWith("diff --git ") ||
    text.startsWith("--- ") ||
    text.includes("\n@@ ")
  );
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}
