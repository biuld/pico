import { SyntaxStyle } from "@opentui/core";
import type { TuiTheme } from "../../theme";

export function createTranscriptSyntaxStyle(theme: TuiTheme): SyntaxStyle {
  return SyntaxStyle.fromStyles({
    text: { fg: theme.colors.text },
    "markup.heading": { fg: theme.colors.textStrong, bold: true },
    "markup.bold": { fg: theme.colors.textStrong, bold: true },
    "markup.italic": { fg: theme.colors.text, italic: true },
    "markup.link": { fg: theme.colors.status, underline: true },
    "markup.raw": { fg: theme.colors.status },
    keyword: { fg: theme.colors.status, bold: true },
    string: { fg: "#86efac" },
    number: { fg: "#f0abfc" },
    comment: { fg: theme.colors.muted, italic: true },
    function: { fg: "#93c5fd" },
    variable: { fg: theme.colors.text },
    type: { fg: "#c4b5fd" },
  });
}
