/** @jsxImportSource @opentui/solid */
import type { SyntaxStyle } from "@opentui/core";
import type { TranscriptCommandBlock } from "../../../transcript";
import type { TuiTheme } from "../../../theme";
import { SolidText } from "../../solid-text";
import { formatMainTranscriptOutputPreview } from "../preview";
import type { MainTranscriptMuteStrategy } from "../preview";
import { buildCommandHeader } from "./headers";
import { MutedText } from "./shared";

export function CommandBlock(props: {
  id: string;
  block: TranscriptCommandBlock;
  theme: TuiTheme;
  syntaxStyle: SyntaxStyle;
  strategy: MainTranscriptMuteStrategy;
}) {
  const info = buildCommandHeader(props.block.payload);
  const fg = info.isRunning
    ? props.theme.colors.status
    : info.isFailed
      ? props.theme.colors.error
      : props.theme.colors.status;

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
        content={info.text}
        fg={fg}
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
