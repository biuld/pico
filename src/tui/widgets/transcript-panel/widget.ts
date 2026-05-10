import { ScrollBoxRenderable, type CliRenderer } from "@opentui/core";
import {
  blockText,
  type TranscriptCell,
} from "../../transcript";
import type { TuiTheme } from "../../theme";
import { createCellRenderable } from "./blocks";
import { createTranscriptSyntaxStyle } from "./syntax";
import type { TranscriptWidget } from "./types";

export function createTranscriptWidget(
  renderer: CliRenderer,
  theme: TuiTheme,
): TranscriptWidget {
  let activeTheme = theme;
  let lastSignature = "";
  let lastThemeName = "";
  let lastCells: readonly TranscriptCell[] = [];
  let syntaxStyle = createTranscriptSyntaxStyle(activeTheme);
  const colors = activeTheme.colors;

  const root = new ScrollBoxRenderable(renderer, {
    id: "pico-transcript-panel",
    flexGrow: 1,
    width: "100%",
    border: false,
    scrollX: false,
    scrollY: true,
    stickyScroll: true,
    stickyStart: "bottom",
    backgroundColor: colors.background,
    viewportOptions: {
      backgroundColor: colors.background,
    },
    contentOptions: {
      flexDirection: "column",
      width: "100%",
      paddingX: 2,
      paddingY: 1,
      rowGap: 1,
      backgroundColor: colors.background,
    },
    verticalScrollbarOptions: {
      visible: false,
    },
    horizontalScrollbarOptions: {
      visible: false,
    },
  });

  const sync = (cells: readonly TranscriptCell[], nextTheme = activeTheme) => {
    const signature = transcriptSignature(cells);
    if (signature === lastSignature && nextTheme.name === lastThemeName) return;

    const themeChanged = nextTheme.name !== lastThemeName;
    activeTheme = nextTheme;
    lastCells = cells;
    lastSignature = signature;
    lastThemeName = nextTheme.name;
    applyContainerTheme(root, activeTheme);
    clearChildren(root);
    if (themeChanged) replaceSyntaxStyle();

    for (const [index, cell] of cells.entries()) {
      root.add(createCellRenderable(renderer, cell, index, activeTheme, syntaxStyle));
    }
  };

  return {
    root,
    sync,
    scrollBy: (delta) => {
      root.scrollBy(delta);
    },
    scrollToBottom: () => {
      root.scrollTo({ x: 0, y: Math.max(0, root.scrollHeight - root.viewport.height) });
    },
    applyTheme: (nextTheme) => {
      activeTheme = nextTheme;
      applyContainerTheme(root, nextTheme);
      if (lastThemeName && nextTheme.name !== lastThemeName) {
        sync(lastCells, nextTheme);
      }
    },
  };

  function replaceSyntaxStyle(): void {
    const previousStyle = syntaxStyle;
    syntaxStyle = createTranscriptSyntaxStyle(activeTheme);
    previousStyle.destroy();
  }
}

function applyContainerTheme(root: ScrollBoxRenderable, theme: TuiTheme): void {
  root.backgroundColor = theme.colors.background;
  root.viewport.backgroundColor = theme.colors.background;
  root.content.backgroundColor = theme.colors.background;
}

function clearChildren(root: ScrollBoxRenderable): void {
  for (const child of [...root.getChildren()]) {
    root.remove(child.id);
    child.destroyRecursively();
  }
}

function transcriptSignature(cells: readonly TranscriptCell[]): string {
  return JSON.stringify(cells.map((cell) => ({
    id: cell.id,
    kind: cell.kind,
    status: cell.status,
    blocks: cell.blocks.map((block) => [block.type, blockText(block)]),
  })));
}
