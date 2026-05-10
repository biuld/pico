import {
  BoxRenderable,
  CodeRenderable,
  DiffRenderable,
  MarkdownRenderable,
  ScrollBoxRenderable,
  SyntaxStyle,
  TextAttributes,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import {
  blockText,
  type TranscriptBlock,
  type TranscriptCell,
  type TranscriptCommandBlock,
  type TranscriptFileChangeBlock,
  type TranscriptTextBlock,
  type TranscriptToolBlock,
} from "../transcript";
import type { TuiTheme } from "../theme";

export interface TranscriptWidget {
  root: ScrollBoxRenderable;
  sync(cells: readonly TranscriptCell[], theme?: TuiTheme): void;
  scrollBy(delta: number): void;
  scrollToBottom(): void;
  applyTheme(theme: TuiTheme): void;
}

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

function createCellRenderable(
  renderer: CliRenderer,
  cell: TranscriptCell,
  index: number,
  theme: TuiTheme,
  syntaxStyle: SyntaxStyle,
): BoxRenderable {
  const isUser = cell.kind === "user_message";
  const root = new BoxRenderable(renderer, {
    id: `pico-transcript-cell-${safeId(cell.id)}-${index}`,
    width: "100%",
    flexDirection: "column",
    flexShrink: 0,
    rowGap: 0,
    paddingX: isUser ? 1 : 0,
    paddingY: isUser ? 1 : 0,
    backgroundColor: isUser ? theme.colors.userMessageBackground : theme.colors.background,
  });

  for (const [blockIndex, block] of cell.blocks.entries()) {
    const renderable = createBlockRenderable(renderer, cell, block, blockIndex, theme, syntaxStyle);
    if (renderable) root.add(renderable);
  }

  return root;
}

function createBlockRenderable(
  renderer: CliRenderer,
  cell: TranscriptCell,
  block: TranscriptBlock,
  blockIndex: number,
  theme: TuiTheme,
  syntaxStyle: SyntaxStyle,
): BoxRenderable | TextRenderable | MarkdownRenderable | CodeRenderable | DiffRenderable | undefined {
  const id = `pico-transcript-block-${safeId(cell.id)}-${blockIndex}`;
  switch (block.type) {
    case "markdown":
      return createMarkdownBlock(renderer, id, block.payload.text, block.payload.streaming, theme, syntaxStyle);
    case "reasoning":
      return createMutedText(renderer, id, `• ${block.payload.text}`, theme);
    case "text":
      return createTextBlock(renderer, id, cell, block, theme);
    case "tool":
      return createToolBlock(renderer, id, block, theme);
    case "command":
      return createCommandBlock(renderer, id, block, theme, syntaxStyle);
    case "file_change":
      return createFileChangeBlock(renderer, id, block, theme, syntaxStyle);
  }
}

function createMarkdownBlock(
  renderer: CliRenderer,
  id: string,
  text: string,
  streaming: boolean | undefined,
  theme: TuiTheme,
  syntaxStyle: SyntaxStyle,
): MarkdownRenderable {
  return new MarkdownRenderable(renderer, {
    id,
    width: "100%",
    content: text,
    syntaxStyle,
    fg: theme.colors.text,
    bg: theme.colors.background,
    conceal: true,
    concealCode: false,
    streaming: Boolean(streaming),
    internalBlockMode: "top-level",
    tableOptions: {
      style: "columns",
      widthMode: "full",
      wrapMode: "word",
      borders: false,
      cellPadding: 0,
    },
  });
}

function createTextBlock(
  renderer: CliRenderer,
  id: string,
  cell: TranscriptCell,
  block: TranscriptTextBlock,
  theme: TuiTheme,
): TextRenderable {
  const prefix = cell.kind === "user_message" ? "› " : cell.status === "failed" ? "! " : "";
  const tone = block.payload.tone;
  return new TextRenderable(renderer, {
    id,
    width: "100%",
    content: `${prefix}${block.payload.text}`,
    fg: textColorForTone(tone, theme),
    bg: cell.kind === "user_message" ? theme.colors.userMessageBackground : theme.colors.background,
    attributes: tone === "strong" ? TextAttributes.BOLD : tone === "muted" ? TextAttributes.DIM : TextAttributes.NONE,
    wrapMode: "word",
  });
}

function createToolBlock(
  renderer: CliRenderer,
  id: string,
  block: TranscriptToolBlock,
  theme: TuiTheme,
): BoxRenderable {
  const root = new BoxRenderable(renderer, {
    id,
    width: "100%",
    flexDirection: "column",
    rowGap: 0,
    backgroundColor: theme.colors.background,
  });
  const header = [block.payload.label, block.payload.detail]
    .filter(Boolean)
    .join(" ");
  root.add(new TextRenderable(renderer, {
    id: `${id}-header`,
    width: "100%",
    content: `↳ ${header}`,
    fg: theme.colors.status,
    bg: theme.colors.background,
    wrapMode: "word",
  }));
  if (block.payload.body) {
    root.add(createMutedText(renderer, `${id}-body`, block.payload.body, theme));
  }
  return root;
}

function createCommandBlock(
  renderer: CliRenderer,
  id: string,
  block: TranscriptCommandBlock,
  theme: TuiTheme,
  syntaxStyle: SyntaxStyle,
): BoxRenderable {
  const root = new BoxRenderable(renderer, {
    id,
    width: "100%",
    flexDirection: "column",
    rowGap: 0,
    backgroundColor: theme.colors.background,
  });
  root.add(new TextRenderable(renderer, {
    id: `${id}-header`,
    width: "100%",
    content: `$ ${block.payload.command}`,
    fg: theme.colors.status,
    bg: theme.colors.background,
    wrapMode: "word",
  }));
  if (block.payload.output) {
    root.add(new CodeRenderable(renderer, {
      id: `${id}-output`,
      width: "100%",
      content: block.payload.output,
      filetype: "text",
      syntaxStyle,
      fg: theme.colors.muted,
      bg: theme.colors.background,
      wrapMode: "word",
      conceal: false,
      drawUnstyledText: true,
    }));
  }
  return root;
}

function createFileChangeBlock(
  renderer: CliRenderer,
  id: string,
  block: TranscriptFileChangeBlock,
  theme: TuiTheme,
  syntaxStyle: SyntaxStyle,
): BoxRenderable {
  const root = new BoxRenderable(renderer, {
    id,
    width: "100%",
    flexDirection: "column",
    rowGap: 0,
    backgroundColor: theme.colors.background,
  });
  const header = block.payload.path || block.payload.summary || "file change";
  root.add(new TextRenderable(renderer, {
    id: `${id}-header`,
    width: "100%",
    content: `~ ${header}`,
    fg: theme.colors.status,
    bg: theme.colors.background,
    wrapMode: "word",
  }));
  if (block.payload.diff) {
    root.add(createPatchRenderable(renderer, `${id}-diff`, block.payload.diff, theme, syntaxStyle));
  }
  return root;
}

function createPatchRenderable(
  renderer: CliRenderer,
  id: string,
  diff: string,
  theme: TuiTheme,
  syntaxStyle: SyntaxStyle,
): CodeRenderable | DiffRenderable {
  if (looksLikeUnifiedDiff(diff)) {
    return new DiffRenderable(renderer, {
      id,
      width: "100%",
      diff,
      view: "unified",
      syntaxStyle,
      fg: theme.colors.text,
      wrapMode: "word",
      showLineNumbers: false,
      contextBg: theme.colors.background,
      lineNumberBg: theme.colors.background,
      lineNumberFg: theme.colors.muted,
    });
  }
  return new CodeRenderable(renderer, {
    id,
    width: "100%",
    content: diff,
    filetype: "diff",
    syntaxStyle,
    fg: theme.colors.muted,
    bg: theme.colors.background,
    wrapMode: "word",
    conceal: false,
    drawUnstyledText: true,
  });
}

function createMutedText(
  renderer: CliRenderer,
  id: string,
  text: string,
  theme: TuiTheme,
): TextRenderable {
  return new TextRenderable(renderer, {
    id,
    width: "100%",
    content: text,
    fg: theme.colors.muted,
    bg: theme.colors.background,
    attributes: TextAttributes.DIM,
    wrapMode: "word",
  });
}

function textColorForTone(
  tone: TranscriptTextBlock["payload"]["tone"],
  theme: TuiTheme,
): string {
  switch (tone) {
    case "strong":
      return theme.colors.textStrong;
    case "muted":
      return theme.colors.muted;
    case "status":
      return theme.colors.status;
    case "error":
      return "#ef4444";
    default:
      return theme.colors.text;
  }
}

function createTranscriptSyntaxStyle(theme: TuiTheme): SyntaxStyle {
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

function looksLikeUnifiedDiff(text: string): boolean {
  return (
    text.startsWith("diff --git ") ||
    text.startsWith("--- ") ||
    text.includes("\n@@ ")
  );
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}
