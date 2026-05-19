/** @jsxImportSource @opentui/solid */
import type { SyntaxStyle } from "@opentui/core";
import { TextAttributes } from "@opentui/core";
import type { TuiTheme } from "../../../theme";
import { SolidText } from "../../solid-text";

export function MutedText(props: {
  id: string;
  text: string;
  theme: TuiTheme;
  backgroundColor?: string;
}) {
  return (
    <SolidText
      id={props.id}
      width="100%"
      content={props.text}
      fg={props.theme.colors.muted}
      bg={props.backgroundColor || props.theme.colors.background}
      attributes={TextAttributes.DIM}
      wrapMode="word"
    />
  );
}

export function PatchBlock(props: {
  id: string;
  diff: string;
  theme: TuiTheme;
  syntaxStyle: SyntaxStyle;
}) {
  if (looksLikeUnifiedDiff(props.diff)) {
    return (
      <diff
        id={props.id}
        width="100%"
        diff={props.diff}
        view="unified"
        syntaxStyle={props.syntaxStyle}
        fg={props.theme.colors.text}
        wrapMode="word"
        showLineNumbers={false}
        contextBg={props.theme.colors.background}
        lineNumberBg={props.theme.colors.background}
        lineNumberFg={props.theme.colors.muted}
      />
    );
  }

  return (
    <code
      id={props.id}
      width="100%"
      content={props.diff}
      filetype="diff"
      syntaxStyle={props.syntaxStyle}
      fg={props.theme.colors.muted}
      bg={props.theme.colors.background}
      wrapMode="word"
      conceal={false}
      drawUnstyledText={true}
    />
  );
}

function looksLikeUnifiedDiff(text: string): boolean {
  return (
    text.startsWith("diff --git ") ||
    text.startsWith("--- ") ||
    text.includes("\n@@ ")
  );
}
