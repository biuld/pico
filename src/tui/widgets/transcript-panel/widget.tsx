/** @jsxImportSource @opentui/solid */
import { For } from "solid-js";
import type { ScrollBoxRenderable, SyntaxStyle } from "@opentui/core";
import {
  blockText,
  type TranscriptCell,
} from "../../transcript";
import type { TuiTheme } from "../../theme";
import { TranscriptCellView } from "./blocks";

export interface TranscriptPanelViewProps {
  cells: readonly TranscriptCell[];
  theme: TuiTheme;
  syntaxStyle: SyntaxStyle;
  onScrollRef(root: ScrollBoxRenderable): void;
}

export function TranscriptPanelView(props: TranscriptPanelViewProps) {
  return (
    <scrollbox
      id="pico-transcript-panel"
      ref={props.onScrollRef}
      flexGrow={1}
      width="100%"
      border={false}
      scrollX={false}
      scrollY={true}
      stickyScroll={true}
      stickyStart="bottom"
      backgroundColor={props.theme.colors.background}
      viewportOptions={{
        backgroundColor: props.theme.colors.background,
      }}
      contentOptions={{
        flexDirection: "column",
        width: "100%",
        paddingX: 2,
        paddingY: 1,
        rowGap: 1,
        backgroundColor: props.theme.colors.background,
      }}
      verticalScrollbarOptions={{
        visible: false,
      }}
      horizontalScrollbarOptions={{
        visible: false,
      }}
    >
      <For each={props.cells}>
        {(cell, index) => (
          <TranscriptCellView
            cell={cell}
            index={index()}
            theme={props.theme}
            syntaxStyle={props.syntaxStyle}
          />
        )}
      </For>
    </scrollbox>
  );
}

export function transcriptSignature(cells: readonly TranscriptCell[]): string {
  return JSON.stringify(cells.map((cell) => ({
    id: cell.id,
    kind: cell.kind,
    status: cell.status,
    blocks: cell.blocks.map((block) => [block.type, blockText(block)]),
  })));
}
