/** @jsxImportSource @opentui/solid */
import { For } from "solid-js";
import type { SyntaxStyle } from "@opentui/core";
import type {
  TranscriptBlock,
  TranscriptCell,
} from "../../../transcript";
import type { TuiTheme } from "../../../theme";
import { SolidText } from "../../solid-text";
import { mainTranscriptMuteStrategyForCell } from "../preview";
import { CommandBlock } from "./command";
import { FileChangeBlock } from "./file-change";
import { ToolBlock } from "./tool";
import { ReasoningBlock, TextBlock, PlanBlock } from "./text-blocks";

// Re-export header helpers for backward compat
export {
  formatCwdForHeader,
  buildCommandHeader,
  buildFileChangeInfo,
  buildToolHeader,
} from "./headers";
export type {
  CommandHeaderInfo,
  FileChangeInfo,
} from "./headers";

// Re-export shared low-level components for sub-files
export { MutedText, PatchBlock } from "./shared";

// ── Top-level components ──

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

// ── Internal block dispatcher ──

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
    case "markdown": {
      const mermaidBlocks = detectMermaidBlocks(props.block.payload.text);
      return (
        <box id={id} width="100%" flexDirection="column" rowGap={0} backgroundColor={props.theme.colors.background}>
          <markdown
            id={`${id}-md`}
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
          {mermaidBlocks.map((source, i) => (
            <MermaidPlaceholder
              id={`${id}-mermaid-${i}`}
              source={source}
              theme={props.theme}
            />
          ))}
        </box>
      );
    }
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

// ── Mermaid ──

function detectMermaidBlocks(text: string): string[] {
  const blocks: string[] = [];
  const regex = /```mermaid\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

function MermaidPlaceholder(props: {
  id: string;
  source: string;
  theme: TuiTheme;
}) {
  const previewLines = props.source.split("\n").slice(0, 3);
  return (
    <box
      id={props.id}
      width="100%"
      flexDirection="column"
      borderStyle="single"
      borderColor={props.theme.colors.muted}
      marginTop={1}
      marginBottom={1}
      paddingX={1}
      backgroundColor={props.theme.colors.background}
    >
      <SolidText
        id={`${props.id}-label`}
        content=" Mermaid diagram "
        fg={props.theme.colors.status}
        bg={props.theme.colors.background}
        wrapMode="word"
      />
      {previewLines.map((line, i) => (
        <SolidText
          id={`${props.id}-preview-${i}`}
          content={` ${line.slice(0, 60)}${line.length > 60 ? "..." : ""}`}
          fg={props.theme.colors.muted}
          bg={props.theme.colors.background}
          wrapMode="word"
        />
      ))}
      <SolidText
        id={`${props.id}-hint`}
        content=" [diagram rendering coming soon]"
        fg={props.theme.colors.placeholder}
        bg={props.theme.colors.background}
        wrapMode="word"
      />
    </box>
  );
}

// ── Utilities ──

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}
