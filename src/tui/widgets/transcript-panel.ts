import {
  BoxRenderable,
  StyledText,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import type { TuiTheme } from "../theme";

export interface TranscriptWidget {
  root: BoxRenderable;
  text: TextRenderable;
  setContent(content: string | StyledText): void;
  resetScroll(): void;
  contentHeight(rendererHeight: number, bottomInset: number): number;
  applyTheme(theme: TuiTheme): void;
}

export function createTranscriptWidget(
  renderer: CliRenderer,
  theme: TuiTheme,
): TranscriptWidget {
  const colors = theme.colors;
  const root = new BoxRenderable(renderer, {
    id: "pico-transcript-panel",
    flexGrow: 1,
    width: "100%",
    border: false,
    paddingX: 2,
    paddingY: 1,
    backgroundColor: colors.background,
  });

  const text = new TextRenderable(renderer, {
    id: "pico-transcript-text",
    width: "100%",
    height: "100%",
    content: "",
    fg: colors.text,
    wrapMode: "word",
  });

  root.add(text);

  return {
    root,
    text,
    setContent: (content) => {
      text.content = content;
    },
    resetScroll: () => {
      text.scrollY = 0;
    },
    contentHeight: (rendererHeight, bottomInset) => {
      return Math.max(1, root.height || rendererHeight - bottomInset);
    },
    applyTheme: (nextTheme) => {
      root.backgroundColor = nextTheme.colors.background;
      text.fg = nextTheme.colors.text;
    },
  };
}
