import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core";
import type { OverlayView } from "../overlay-model";
import type { TuiTheme } from "../theme";

export interface OverlayWidget {
  root: BoxRenderable;
  text: TextRenderable;
  footer: TextRenderable;
  applyTheme(theme: TuiTheme): void;
  applyView(view: OverlayView): void;
}

export function createOverlayWidget(
  renderer: CliRenderer,
  theme: TuiTheme,
  bottomInset: () => number,
): OverlayWidget {
  const colors = theme.colors;
  const root = new BoxRenderable(renderer, {
    id: "pico-overlay",
    position: "absolute",
    zIndex: 20,
    visible: false,
    flexDirection: "column",
    width: "100%",
    height: 1,
    border: true,
    borderColor: colors.border,
    paddingX: 1,
    paddingY: 0,
    backgroundColor: colors.overlay,
  });

  const text = new TextRenderable(renderer, {
    id: "pico-overlay-text",
    width: "100%",
    height: 1,
    flexGrow: 1,
    content: "",
    fg: colors.text,
    wrapMode: "word",
    truncate: false,
  });

  const footer = new TextRenderable(renderer, {
    id: "pico-overlay-footer",
    width: "100%",
    height: 1,
    visible: false,
    content: "",
    fg: colors.muted,
    wrapMode: "none",
    truncate: true,
  });

  root.add(text);
  root.add(footer);

  return {
    root,
    text,
    footer,
    applyTheme: (nextTheme) => {
      root.backgroundColor = nextTheme.colors.overlay;
      root.borderColor = nextTheme.colors.border;
      text.fg = nextTheme.colors.text;
      footer.fg = nextTheme.colors.muted;
    },
    applyView: (view) => {
      root.visible = view.visible;
      text.scrollY = view.scrollY;
      text.content = view.content;
      footer.content = view.footer || "";
      footer.visible = Boolean(view.footer);

      if (!view.visible) {
        root.height = 1;
        root.title = undefined;
        return;
      }

      root.title = view.title;
      if (view.fullScreen) {
        root.left = 0;
        root.top = 0;
        root.bottom = undefined;
        root.width = renderer.width;
        root.height = renderer.height;
      } else {
        root.left = 2;
        root.top = undefined;
        root.bottom = bottomInset();
        root.width = Math.max(20, renderer.width - 4);
        root.height = Math.max(3, view.height);
      }
    },
  };
}
