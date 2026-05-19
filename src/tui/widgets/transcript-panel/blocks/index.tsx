/** @jsxImportSource @opentui/solid */
import { For } from "solid-js";
import type { SyntaxStyle } from "@opentui/core";
import type {
  TranscriptBlock,
  TranscriptCell,
} from "../../../transcript";
import type { TuiTheme } from "../../../theme";
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

// ── Utilities ──

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}
