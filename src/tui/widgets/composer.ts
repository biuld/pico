import {
  BoxRenderable,
  InputRenderable,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import type { JSONRPCRequest } from "../../codex/types";
import type { TuiState } from "../state";
import type { TuiTheme } from "../theme";

export const COMPOSER_HEIGHT = 5;

export interface ComposerWidget {
  root: BoxRenderable;
  input: InputRenderable;
  height: number;
  setStatus(content: string): void;
  setFooter(content: string): void;
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

  const statusText = new TextRenderable(renderer, {
    id: "pico-status",
    width: "100%",
    height: 1,
    content: "",
    fg: colors.status,
    wrapMode: "none",
    truncate: true,
  });

  const composerRow = new BoxRenderable(renderer, {
    id: "pico-composer-row",
    flexDirection: "row",
    width: "100%",
    height: 3,
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

  const footerText = new TextRenderable(renderer, {
    id: "pico-footer",
    width: "100%",
    height: 1,
    content: "",
    fg: colors.muted,
    wrapMode: "none",
    truncate: true,
  });

  composerRow.add(promptText);
  composerRow.add(input);
  root.add(statusText);
  root.add(composerRow);
  root.add(footerText);

  return {
    root,
    input,
    height: COMPOSER_HEIGHT,
    setStatus: (content) => {
      statusText.content = content;
    },
    setFooter: (content) => {
      footerText.content = content;
    },
    applyTheme: (nextTheme) => {
      const next = nextTheme.colors;
      root.backgroundColor = next.background;
      statusText.fg = next.status;
      composerRow.backgroundColor = next.background;
      composerRow.borderColor = next.border;
      promptText.fg = next.textStrong;
      input.textColor = next.text;
      input.focusedTextColor = next.textStrong;
      input.backgroundColor = next.background;
      input.focusedBackgroundColor = next.background;
      input.placeholderColor = next.placeholder;
      footerText.fg = next.muted;
    },
  };
}

export interface ComposerStatusInput {
  pendingApproval?: JSONRPCRequest;
  running: boolean;
  turnStatus: TuiState["turnStatus"];
  statusMessage?: string;
}

export function formatComposerStatus(input: ComposerStatusInput): string {
  if (input.pendingApproval) return `• Action required: ${input.pendingApproval.method}`;
  if (input.turnStatus === "failed" && input.statusMessage) return `! ${input.statusMessage}`;
  if (input.running) return `• ${input.statusMessage || "Working"}`;
  if (input.statusMessage) return `• ${input.statusMessage}`;
  return "";
}
