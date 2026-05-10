import {
  BoxRenderable,
  InputRenderable,
  StyledText,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import type { JSONRPCRequest } from "../../codex/app-server";
import type { TuiState } from "../state";
import type { TuiTheme } from "../theme";

export const COMPOSER_TRANSIENT_STATUS_HEIGHT = 1;
export const COMPOSER_ROW_HEIGHT = 3;
export const COMPOSER_STATUS_LINE_HEIGHT = 1;
export const COMPOSER_HEIGHT =
  COMPOSER_TRANSIENT_STATUS_HEIGHT + COMPOSER_ROW_HEIGHT + COMPOSER_STATUS_LINE_HEIGHT;
export const COMPOSER_OVERLAY_INSET = COMPOSER_HEIGHT;

export interface ComposerWidget {
  root: BoxRenderable;
  input: InputRenderable;
  height: number;
  overlayInset: number;
  setTransientStatus(content: string): void;
  setPlaceholder(content: string): void;
  setStatusLine(content: string | StyledText): void;
  applyTheme(theme: TuiTheme): void;
}

export function createComposerWidget(
  renderer: CliRenderer,
  theme: TuiTheme,
): ComposerWidget {
  const colors = theme.colors;
  const root = new BoxRenderable(renderer, {
    id: "pico-bottom-pane",
    flexDirection: "column",
    width: "100%",
    height: COMPOSER_HEIGHT,
    border: false,
    paddingX: 2,
    paddingY: 0,
    backgroundColor: colors.background,
  });

  const transientStatusText = new TextRenderable(renderer, {
    id: "pico-transient-status",
    width: "100%",
    height: COMPOSER_TRANSIENT_STATUS_HEIGHT,
    content: "",
    fg: colors.muted,
    wrapMode: "none",
    truncate: true,
  });

  const composerRow = new BoxRenderable(renderer, {
    id: "pico-composer-row",
    flexDirection: "row",
    width: "100%",
    height: COMPOSER_ROW_HEIGHT,
    border: ["top", "bottom"],
    borderColor: colors.border,
    borderStyle: "single",
    paddingX: 0,
    paddingY: 0,
    backgroundColor: colors.background,
  });

  const promptText = new TextRenderable(renderer, {
    id: "pico-composer-prompt",
    width: 2,
    height: 1,
    content: "› ",
    fg: colors.textStrong,
    wrapMode: "none",
    truncate: true,
  });

  const input = new InputRenderable(renderer, {
    id: "pico-input",
    flexGrow: 1,
    height: 1,
    maxLength: 8000,
    placeholder: "Ask Pico to do anything",
    textColor: colors.text,
    focusedTextColor: colors.textStrong,
    backgroundColor: colors.background,
    focusedBackgroundColor: colors.background,
    placeholderColor: colors.placeholder,
  });

  const statusLineText = new TextRenderable(renderer, {
    id: "pico-statusline",
    width: "100%",
    height: COMPOSER_STATUS_LINE_HEIGHT,
    content: "",
    fg: colors.status,
    wrapMode: "none",
    truncate: true,
  });

  composerRow.add(promptText);
  composerRow.add(input);
  root.add(transientStatusText);
  root.add(composerRow);
  root.add(statusLineText);

  return {
    root,
    input,
    height: COMPOSER_HEIGHT,
    overlayInset: COMPOSER_OVERLAY_INSET,
    setTransientStatus: (content) => {
      transientStatusText.content = content;
    },
    setPlaceholder: (content) => {
      input.placeholder = content;
    },
    setStatusLine: (content) => {
      statusLineText.content = content;
    },
    applyTheme: (nextTheme) => {
      const next = nextTheme.colors;
      root.backgroundColor = next.background;
      transientStatusText.fg = next.muted;
      composerRow.backgroundColor = next.background;
      composerRow.borderColor = next.border;
      promptText.fg = next.textStrong;
      input.textColor = next.text;
      input.focusedTextColor = next.textStrong;
      input.backgroundColor = next.background;
      input.focusedBackgroundColor = next.background;
      input.placeholderColor = next.placeholder;
      statusLineText.fg = next.status;
    },
  };
}

export interface ComposerStatusInput {
  pendingApproval?: JSONRPCRequest;
  running: boolean;
  turnStatus: TuiState["turnStatus"];
  statusMessage?: string;
  loadingFrame?: number;
}

export function formatComposerStatus(input: ComposerStatusInput): string {
  if (input.pendingApproval) return `• Action required: ${input.pendingApproval.method}`;
  if (input.turnStatus === "failed" && input.statusMessage) return `! ${input.statusMessage}`;
  if (input.running) {
    return `• ${input.statusMessage || "Working"}${formatLoadingSuffix(input.loadingFrame)}`;
  }
  if (input.statusMessage) return `• ${input.statusMessage}`;
  return "";
}

function formatLoadingSuffix(frame?: number): string {
  if (frame === undefined) return "";
  const dots = frame % 4;
  return `${".".repeat(dots)}${" ".repeat(3 - dots)}`;
}
