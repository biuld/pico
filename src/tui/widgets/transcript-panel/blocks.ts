import {
  BoxRenderable,
  CodeRenderable,
  DiffRenderable,
  MarkdownRenderable,
  SyntaxStyle,
  TextAttributes,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import {
  type TranscriptBlock,
  type TranscriptCell,
  type TranscriptCommandBlock,
  type TranscriptFileChangeBlock,
  type TranscriptPlanBlock,
  type TranscriptPlanStepStatus,
  type TranscriptTextBlock,
  type TranscriptToolBlock,
} from "../../transcript";
import type { TuiTheme } from "../../theme";
import {
  compactTranscriptPreview,
  formatMainTranscriptOutputPreview,
  mainTranscriptMuteStrategyForCell,
  type MainTranscriptMuteStrategy,
} from "./preview";

export function createCellRenderable(
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
  const strategy = mainTranscriptMuteStrategyForCell(cell);
  switch (block.type) {
    case "markdown":
      return createMarkdownBlock(renderer, id, block.payload.text, block.payload.streaming, theme, syntaxStyle);
    case "reasoning":
      return createReasoningBlock(renderer, id, block.payload.text, theme, strategy);
    case "plan":
      return createPlanBlock(renderer, id, block, theme);
    case "text":
      return createTextBlock(renderer, id, cell, block, theme);
    case "tool":
      return createToolBlock(renderer, id, block, theme, strategy);
    case "command":
      return createCommandBlock(renderer, id, block, theme, syntaxStyle, strategy);
    case "file_change":
      return createFileChangeBlock(renderer, id, block, theme, syntaxStyle, strategy);
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

function createReasoningBlock(
  renderer: CliRenderer,
  id: string,
  text: string,
  theme: TuiTheme,
  strategy: MainTranscriptMuteStrategy,
): TextRenderable {
  const content = strategy === "expanded"
    ? text
    : compactTranscriptPreview(text, 160);
  return createMutedText(renderer, id, `• ${content}`, theme);
}

function createPlanBlock(
  renderer: CliRenderer,
  id: string,
  block: TranscriptPlanBlock,
  theme: TuiTheme,
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
    content: "• Updated Plan",
    fg: theme.colors.textStrong,
    bg: theme.colors.background,
    attributes: TextAttributes.BOLD,
    wrapMode: "word",
  }));
  if (block.payload.explanation) {
    root.add(new TextRenderable(renderer, {
      id: `${id}-explanation`,
      width: "100%",
      content: `  └ ${block.payload.explanation}`,
      fg: theme.colors.muted,
      bg: theme.colors.background,
      attributes: TextAttributes.DIM | TextAttributes.ITALIC,
      wrapMode: "word",
    }));
  }
  if (block.payload.steps.length === 0) {
    root.add(new TextRenderable(renderer, {
      id: `${id}-empty`,
      width: "100%",
      content: "  └ (no steps provided)",
      fg: theme.colors.muted,
      bg: theme.colors.background,
      attributes: TextAttributes.DIM | TextAttributes.ITALIC,
      wrapMode: "word",
    }));
    return root;
  }
  for (const [index, step] of block.payload.steps.entries()) {
    root.add(createPlanStepRenderable(
      renderer,
      `${id}-step-${index}`,
      index === 0 && !block.payload.explanation ? "  └ " : "    ",
      step.status,
      step.step,
      theme,
    ));
  }
  return root;
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

function planStepMarker(status: TranscriptPlanStepStatus): string {
  switch (status) {
    case "completed":
      return "✓";
    case "in_progress":
    case "pending":
      return "□";
  }
}

function createPlanStepRenderable(
  renderer: CliRenderer,
  id: string,
  prefix: string,
  status: TranscriptPlanStepStatus,
  text: string,
  theme: TuiTheme,
): BoxRenderable {
  const style = planStepStyle(status, theme);
  const root = new BoxRenderable(renderer, {
    id,
    width: "100%",
    flexDirection: "row",
    flexShrink: 0,
    rowGap: 0,
    columnGap: 0,
    backgroundColor: theme.colors.background,
  });
  root.add(new TextRenderable(renderer, {
    id: `${id}-prefix`,
    content: `${prefix}${planStepMarker(status)} `,
    fg: style.fg,
    bg: theme.colors.background,
    attributes: style.prefixAttributes,
    wrapMode: "word",
  }));
  root.add(new TextRenderable(renderer, {
    id: `${id}-text`,
    content: text,
    fg: style.fg,
    bg: theme.colors.background,
    attributes: style.textAttributes,
    wrapMode: "word",
  }));
  return root;
}

function planStepStyle(
  status: TranscriptPlanStepStatus,
  theme: TuiTheme,
): { fg: string; prefixAttributes: number; textAttributes: number } {
  switch (status) {
    case "completed":
      return {
        fg: theme.colors.muted,
        prefixAttributes: TextAttributes.DIM,
        textAttributes: TextAttributes.DIM | TextAttributes.STRIKETHROUGH,
      };
    case "in_progress":
      return {
        fg: theme.colors.status,
        prefixAttributes: TextAttributes.BOLD,
        textAttributes: TextAttributes.BOLD,
      };
    case "pending":
      return {
        fg: theme.colors.muted,
        prefixAttributes: TextAttributes.DIM,
        textAttributes: TextAttributes.DIM,
      };
  }
}

function createToolBlock(
  renderer: CliRenderer,
  id: string,
  block: TranscriptToolBlock,
  theme: TuiTheme,
  strategy: MainTranscriptMuteStrategy,
): BoxRenderable {
  const groupBg = theme.colors.background;
  const root = new BoxRenderable(renderer, {
    id,
    width: "100%",
    flexDirection: "column",
    rowGap: 0,
    backgroundColor: groupBg,
  });
  const showDetail = strategy === "expanded" || strategy === "tool-call-summary";
  const header = [block.payload.label, showDetail ? block.payload.detail : undefined]
    .filter(Boolean)
    .join(" ");
  if (header) {
    root.add(new TextRenderable(renderer, {
      id: `${id}-header`,
      width: "100%",
      content: `↳ ${header}`,
      fg: theme.colors.status,
      bg: groupBg,
      wrapMode: "word",
    }));
  }
  if (block.payload.body && strategy === "expanded") {
    root.add(createMutedText(renderer, `${id}-body`, block.payload.body, theme, groupBg));
  } else if (block.payload.body && (strategy === "tool-output-preview" || strategy === "tool-call-summary")) {
    root.add(createMutedText(
      renderer,
      `${id}-body-preview`,
      formatMainTranscriptOutputPreview(block.payload.body, {
        includeAnglePipe: Boolean(header),
        includePrefix: Boolean(header),
      }),
      theme,
      groupBg,
    ));
  }
  return root;
}

function createCommandBlock(
  renderer: CliRenderer,
  id: string,
  block: TranscriptCommandBlock,
  theme: TuiTheme,
  syntaxStyle: SyntaxStyle,
  strategy: MainTranscriptMuteStrategy,
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
  if (block.payload.output && strategy === "expanded") {
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
  } else if (block.payload.output && strategy === "command-output-preview") {
    root.add(createMutedText(
      renderer,
      `${id}-output-preview`,
      formatMainTranscriptOutputPreview(block.payload.output, { includeAnglePipe: false }),
      theme,
    ));
  }
  return root;
}

function createFileChangeBlock(
  renderer: CliRenderer,
  id: string,
  block: TranscriptFileChangeBlock,
  theme: TuiTheme,
  syntaxStyle: SyntaxStyle,
  strategy: MainTranscriptMuteStrategy,
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
  if (block.payload.summary && block.payload.summary !== header) {
    root.add(createMutedText(renderer, `${id}-summary`, `  ${block.payload.summary}`, theme));
  }
  if (block.payload.diff && strategy === "expanded") {
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
  backgroundColor = theme.colors.background,
): TextRenderable {
  return new TextRenderable(renderer, {
    id,
    width: "100%",
    content: text,
    fg: theme.colors.muted,
    bg: backgroundColor,
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
