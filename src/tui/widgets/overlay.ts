import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core";
import type { OverlayView } from "../overlay-model";
import type { TuiTheme } from "../theme";

export interface OverlayWidget {
  root: BoxRenderable;
  body: BoxRenderable;
  text: TextRenderable;
  footer: TextRenderable;
  applyTheme(theme: TuiTheme): void;
  applyView(view: OverlayView): void;
}

export interface OverlayFrame {
  left: number;
  top: number;
  bottom: number | undefined;
  width: number;
  height: number;
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
    backgroundColor: "transparent",
  });

  const body = new BoxRenderable(renderer, {
    id: "pico-overlay-body",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    flexGrow: 1,
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

  body.add(text);
  body.add(footer);
  root.add(body);

  return {
    root,
    body,
    text,
    footer,
    applyTheme: (nextTheme) => {
      root.backgroundColor = "transparent";
      body.backgroundColor = nextTheme.colors.overlay;
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
      const frame = overlayFrame(
        renderer.width,
        renderer.height,
        bottomInset(),
        view.fullScreen,
      );
      root.left = frame.left;
      root.top = frame.top;
      root.bottom = frame.bottom;
      root.width = frame.width;
      root.height = frame.height;
    },
  };
}

export function overlayFrame(
  rendererWidth: number,
  rendererHeight: number,
  bottomInset: number,
  fullScreen: boolean,
): OverlayFrame {
  const width = Math.max(1, rendererWidth);
  const height = Math.max(1, rendererHeight);

  if (fullScreen) {
    return {
      left: 0,
      top: 0,
      bottom: undefined,
      width,
      height,
    };
  }

  return {
    left: 0,
    top: 0,
    bottom: undefined,
    width,
    height: Math.max(1, height - Math.max(0, bottomInset)),
  };
}
