/** @jsxImportSource @opentui/solid */
import type { SyntaxStyle } from "@opentui/core";
import type { TranscriptFileChangeBlock } from "../../../transcript";
import type { TuiTheme } from "../../../theme";
import { SolidText } from "../../solid-text";
import type { MainTranscriptMuteStrategy } from "../preview";
import { buildFileChangeInfo } from "./headers";
import { MutedText, PatchBlock } from "./shared";

export function FileChangeBlock(props: {
  id: string;
  block: TranscriptFileChangeBlock;
  theme: TuiTheme;
  syntaxStyle: SyntaxStyle;
  strategy: MainTranscriptMuteStrategy;
}) {
  const info = buildFileChangeInfo(props.block.payload);
  const fg = info.isFailed ? props.theme.colors.error : props.theme.colors.status;

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
        content={info.headerText}
        fg={fg}
        bg={props.theme.colors.background}
        wrapMode="word"
      />
      {props.block.payload.summary && props.block.payload.summary !== props.block.payload.path ? (
        <MutedText
          id={`${props.id}-summary`}
          text={`  ${props.block.payload.summary}`}
          theme={props.theme}
        />
      ) : undefined}
      {props.block.payload.diff && props.strategy !== "expanded" && info.diffLineCount !== null ? (
        <MutedText
          id={`${props.id}-diff-summary`}
          text={info.isDeclined
            ? `  +${info.addedLines} -${info.removedLines}  (declined)`
            : `  +${info.addedLines} -${info.removedLines}  [Enter to expand]`}
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
