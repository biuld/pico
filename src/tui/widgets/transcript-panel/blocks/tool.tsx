/** @jsxImportSource @opentui/solid */
import type { SyntaxStyle } from "@opentui/core";
import type { TranscriptToolBlock } from "../../../transcript";
import type { TuiTheme } from "../../../theme";
import { SolidText } from "../../solid-text";
import { formatMainTranscriptOutputPreview } from "../preview";
import type { MainTranscriptMuteStrategy } from "../preview";
import { buildToolHeader } from "./headers";
import { MutedText, PatchBlock } from "./shared";

export function ToolBlock(props: {
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
