/** @jsxImportSource @opentui/solid */
import { For } from "solid-js";
import type { TuiTheme } from "../../theme";
import { SolidText } from "../solid-text";

export interface PendingInputPreviewMessage {
  text: string;
}

export interface PendingInputPreviewState {
  visible: boolean;
  lines: readonly string[];
  height: number;
}

const PREVIEW_LINE_LIMIT = 3;
const PREVIEW_HINT = "  Esc interrupt + send now · Option+Up edit";

export function emptyPendingInputPreview(): PendingInputPreviewState {
  return {
    visible: false,
    lines: [],
    height: 0,
  };
}

export function buildPendingInputPreview(
  message: PendingInputPreviewMessage | undefined,
  width = 80,
): PendingInputPreviewState {
  if (!message) return emptyPendingInputPreview();

  const lines = ["• Queued follow-up input"];
  const wrapped = wrapPreviewLine(inlineText(message.text), Math.max(8, width - 4));
  const limited = wrapped.slice(0, PREVIEW_LINE_LIMIT);
  lines.push(...limited.map((line, index) => `${index === 0 ? "  ↳ " : "    "}${line}`));
  if (wrapped.length > PREVIEW_LINE_LIMIT) lines.push("    ...");
  lines.push(PREVIEW_HINT);

  return {
    visible: true,
    lines,
    height: lines.length,
  };
}

export function PendingInputPreviewView(props: {
  preview: PendingInputPreviewState;
  theme: TuiTheme;
}) {
  return (
    <box
      id="pico-pending-input-preview"
      flexDirection="column"
      width="100%"
      height={props.preview.height}
      visible={props.preview.visible}
      paddingX={0}
      paddingY={0}
      backgroundColor={props.theme.colors.background}
    >
      <For each={props.preview.lines}>
        {(line, index) => (
          <SolidText
            id={`pico-pending-input-preview-line-${index()}`}
            width="100%"
            height={1}
            content={line}
            fg={index() === 0 ? props.theme.colors.muted : props.theme.colors.placeholder}
            wrapMode="none"
            truncate={true}
          />
        )}
      </For>
    </box>
  );
}

function inlineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function wrapPreviewLine(value: string, width: number): string[] {
  const text = value || "(empty)";
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > width) {
    chunks.push(rest.slice(0, width));
    rest = rest.slice(width);
  }
  chunks.push(rest);
  return chunks;
}
