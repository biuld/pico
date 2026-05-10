import {
  BoxRenderable,
  ScrollBoxRenderable,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import type { OverlayRowView, OverlayView } from "../overlay-model";
import type { TuiTheme } from "../theme";

export interface OverlayWidget {
  root: BoxRenderable;
  body: BoxRenderable;
  text: TextRenderable;
  list: ScrollBoxRenderable;
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

  const list = new ScrollBoxRenderable(renderer, {
    id: "pico-overlay-list",
    width: "100%",
    height: 1,
    flexGrow: 1,
    visible: false,
    scrollX: false,
    scrollY: true,
    backgroundColor: colors.overlay,
    contentOptions: {
      flexDirection: "column",
      backgroundColor: colors.overlay,
    },
    viewportOptions: {
      backgroundColor: colors.overlay,
    },
    verticalScrollbarOptions: {
      visible: false,
    },
    horizontalScrollbarOptions: {
      visible: false,
    },
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

  const rowWidgets: OverlayRowWidget[] = [];
  let currentTheme = theme;

  const ensureRowWidget = (index: number): OverlayRowWidget => {
    const existing = rowWidgets[index];
    if (existing) return existing;

    const root = new BoxRenderable(renderer, {
      id: `pico-overlay-row-${index}`,
      flexDirection: "row",
      width: "100%",
      height: 1,
      backgroundColor: colors.overlay,
    });
    const rowText = new TextRenderable(renderer, {
      id: `pico-overlay-row-text-${index}`,
      width: "100%",
      height: 1,
      flexGrow: 1,
      content: "",
      fg: colors.text,
      wrapMode: "none",
      truncate: true,
    });
    root.add(rowText);
    list.add(root);

    const widget = { root, text: rowText };
    rowWidgets[index] = widget;
    return widget;
  };

  const hideUnusedRows = (startIndex: number) => {
    for (let index = startIndex; index < rowWidgets.length; index += 1) {
      rowWidgets[index].root.visible = false;
    }
  };

  const applyRows = (rows: readonly OverlayRowView[]) => {
    rows.forEach((row, index) => {
      const widget = ensureRowWidget(index);
      widget.root.visible = true;
      widget.root.height = row.height || 1;
      widget.root.backgroundColor = row.backgroundColor || currentTheme.colors.overlayRow;
      widget.text.visible = true;
      widget.text.height = row.height || 1;
      widget.text.fg = row.foregroundColor || currentTheme.colors.text;
      widget.text.content = row.content;
    });
    hideUnusedRows(rows.length);
  };

  body.add(text);
  body.add(list);
  body.add(footer);
  root.add(body);

  return {
    root,
    body,
    text,
    list,
    footer,
    applyTheme: (nextTheme) => {
      currentTheme = nextTheme;
      root.backgroundColor = "transparent";
      body.backgroundColor = nextTheme.colors.overlay;
      list.backgroundColor = nextTheme.colors.overlay;
      list.viewport.backgroundColor = nextTheme.colors.overlay;
      list.content.backgroundColor = nextTheme.colors.overlay;
      root.borderColor = nextTheme.colors.border;
      text.fg = nextTheme.colors.text;
      footer.fg = nextTheme.colors.muted;
      rowWidgets.forEach((row) => {
        row.root.backgroundColor = nextTheme.colors.overlayRow;
        row.text.fg = nextTheme.colors.text;
      });
    },
    applyView: (view) => {
      root.visible = view.visible;
      footer.content = view.footer || "";
      footer.visible = Boolean(view.footer);

      const rows = view.rows || [];
      const rendersRows = rows.length > 0;
      text.visible = !rendersRows;
      list.visible = rendersRows;
      if (rendersRows) {
        text.scrollY = 0;
        text.content = "";
        applyRows(rows);
        list.scrollTop = Math.max(0, view.rowScrollY || 0);
      } else {
        text.scrollY = view.scrollY;
        text.content = view.content;
        hideUnusedRows(0);
      }

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

interface OverlayRowWidget {
  root: BoxRenderable;
  text: TextRenderable;
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
