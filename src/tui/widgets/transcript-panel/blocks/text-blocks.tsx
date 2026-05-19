/** @jsxImportSource @opentui/solid */
import { For } from "solid-js";
import { TextAttributes } from "@opentui/core";
import type { TranscriptCell, TranscriptPlanBlock, TranscriptPlanStepStatus, TranscriptTextBlock } from "../../../transcript";
import type { TuiTheme } from "../../../theme";
import { SolidText } from "../../solid-text";
import { compactTranscriptPreview } from "../preview";
import type { MainTranscriptMuteStrategy } from "../preview";
import { MutedText } from "./shared";

export function ReasoningBlock(props: {
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

export function TextBlock(props: {
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

export function PlanBlock(props: { id: string; block: TranscriptPlanBlock; theme: TuiTheme }) {
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
