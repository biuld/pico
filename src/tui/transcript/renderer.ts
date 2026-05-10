import {
  StyledText,
  bg,
  bold,
  dim,
  fg,
} from "@opentui/core";
import type { TuiTheme } from "../theme";
import {
  TRANSCRIPT_TEXT_BLOCK,
  isTextTranscriptBlock,
  type TranscriptBlock,
  type TranscriptCell,
  type TranscriptCellKind,
  type TranscriptTone,
} from "./cell";
import { displayWidth, wrapTranscriptText } from "./wrap";

export interface TranscriptLineSegment {
  text: string;
  tone?: TranscriptTone;
}

export interface TranscriptDisplayLine {
  cellId: string;
  kind: TranscriptCellKind | "spacer";
  status?: string;
  prefix: string;
  segments: readonly TranscriptLineSegment[];
  width: number;
}

export interface TranscriptBlockRenderContext {
  cell: TranscriptCell;
  width: number;
}

export interface TranscriptBlockRenderer {
  type: string;
  render(
    block: TranscriptBlock,
    context: TranscriptBlockRenderContext,
  ): readonly TranscriptLineSegment[][];
}

export interface TranscriptRenderOptions {
  blockRenderers?: readonly TranscriptBlockRenderer[];
}

const DEFAULT_BLOCK_RENDERERS: readonly TranscriptBlockRenderer[] = [
  {
    type: TRANSCRIPT_TEXT_BLOCK,
    render: (block, context) => {
      if (!isTextTranscriptBlock(block)) return [];
      return textToSegments(block.payload.text, context.width);
    },
  },
];

export function renderTranscriptPlain(
  cells: readonly TranscriptCell[],
  width = 80,
  options: TranscriptRenderOptions = {},
): string {
  return renderTranscriptLines(cells, width, options)
    .map(transcriptLineText)
    .join("\n");
}

export function renderTranscriptStyled(
  cells: readonly TranscriptCell[],
  width: number,
  theme: TuiTheme,
  options: TranscriptRenderOptions = {},
): StyledText {
  return renderTranscriptLinesStyled(
    renderTranscriptLines(cells, width, options),
    theme,
  );
}

export function renderTranscriptCellPlain(
  cell: TranscriptCell,
  width = 80,
  options: TranscriptRenderOptions = {},
): string {
  return renderTranscriptCellLines(cell, width, options)
    .map(transcriptLineText)
    .join("\n");
}

export function renderTranscriptCellStyled(
  cell: TranscriptCell,
  width: number,
  theme: TuiTheme,
  options: TranscriptRenderOptions = {},
): StyledText {
  return renderTranscriptLinesStyled(
    renderTranscriptCellLines(cell, width, options),
    theme,
  );
}

export function renderTranscriptLines(
  cells: readonly TranscriptCell[],
  width: number,
  options: TranscriptRenderOptions = {},
): TranscriptDisplayLine[] {
  const lines: TranscriptDisplayLine[] = [];

  cells.forEach((cell, index) => {
    if (index > 0) {
      lines.push({
        cellId: `${cell.id}:spacer`,
        kind: "spacer",
        prefix: "",
        segments: [],
        width,
      });
    }
    lines.push(...renderTranscriptCellLines(cell, width, options));
  });

  return lines;
}

export function renderTranscriptCellLines(
  cell: TranscriptCell,
  width: number,
  options: TranscriptRenderOptions = {},
): TranscriptDisplayLine[] {
  const prefix = firstLinePrefix(cell);
  const subsequentPrefix = "  ";
  const bodyWidth = Math.max(1, width - subsequentPrefix.length - 1);
  const blockRenderers = resolveBlockRenderers(options.blockRenderers);
  const bodyLines = cell.blocks.flatMap((block) => (
    renderTranscriptBlock(block, { cell, width: bodyWidth }, blockRenderers)
  ));

  if (bodyLines.length === 0) {
    return [{
      cellId: cell.id,
      kind: cell.kind,
      status: cell.status,
      prefix,
      segments: [],
      width,
    }];
  }

  return bodyLines.map((segments, index) => ({
    cellId: cell.id,
    kind: cell.kind,
    status: cell.status,
    prefix: index === 0 ? prefix : subsequentPrefix,
    segments,
    width,
  }));
}

export function renderTranscriptLinesStyled(
  lines: readonly TranscriptDisplayLine[],
  theme: TuiTheme,
): StyledText {
  const chunks: StyledText["chunks"] = [];
  const muted = fg(theme.colors.muted);
  const normal = fg(theme.colors.text);
  const strong = fg(theme.colors.textStrong);
  const status = fg(theme.colors.status);
  const userBg = bg(theme.colors.userMessageBackground);

  lines.forEach((line, index) => {
    if (line.kind === "spacer") {
      chunks.push(muted(""));
    } else if (line.kind === "user") {
      const bodyText = transcriptLineBodyText(line) || " ";
      const fill = Math.max(0, line.width - displayWidth(`${line.prefix}${bodyText}`));
      chunks.push(userBg(dim(bold(muted(line.prefix)))));
      for (const segment of segmentsOrBody(line.segments, bodyText)) {
        chunks.push(userBg(styleSegment(segment, { normal: strong, muted, strong, status })));
      }
      if (fill > 0) chunks.push(userBg(" ".repeat(fill)));
    } else if (line.kind === "system" && line.status === "failed") {
      chunks.push(bold(status(line.prefix)));
      for (const segment of segmentsOrBody(line.segments, transcriptLineBodyText(line))) {
        chunks.push(styleSegment(segment, { normal: status, muted, strong: status, status }));
      }
    } else if (line.kind === "reasoning") {
      chunks.push(dim(muted(line.prefix)));
      for (const segment of segmentsOrBody(line.segments, transcriptLineBodyText(line))) {
        chunks.push(dim(styleSegment(segment, { normal: muted, muted, strong: muted, status })));
      }
    } else if (line.kind === "tool" || line.kind === "file") {
      chunks.push(dim(muted(line.prefix)));
      for (const segment of segmentsOrBody(line.segments, transcriptLineBodyText(line))) {
        chunks.push(dim(styleSegment(segment, { normal: status, muted, strong: status, status })));
      }
    } else if (line.kind === "command") {
      chunks.push(bold(status(line.prefix)));
      for (const segment of segmentsOrBody(line.segments, transcriptLineBodyText(line))) {
        chunks.push(styleSegment(segment, { normal: status, muted, strong: status, status }));
      }
    } else if (line.kind === "plan") {
      chunks.push(dim(muted(line.prefix)));
      for (const segment of segmentsOrBody(line.segments, transcriptLineBodyText(line))) {
        chunks.push(styleSegment(segment, { normal, muted, strong, status }));
      }
    } else if (line.kind === "system") {
      chunks.push(dim(muted(line.prefix)));
      for (const segment of segmentsOrBody(line.segments, transcriptLineBodyText(line))) {
        chunks.push(dim(styleSegment(segment, { normal: muted, muted, strong: muted, status })));
      }
    } else {
      chunks.push(dim(muted(line.prefix)));
      for (const segment of segmentsOrBody(line.segments, transcriptLineBodyText(line))) {
        chunks.push(styleSegment(segment, { normal, muted, strong, status }));
      }
    }

    if (index < lines.length - 1) {
      chunks.push(normal("\n"));
    }
  });

  return new StyledText(chunks);
}

export function transcriptLineText(line: TranscriptDisplayLine): string {
  return `${line.prefix}${transcriptLineBodyText(line)}`;
}

export function transcriptLineBodyText(line: TranscriptDisplayLine): string {
  return line.segments.map((segment) => segment.text).join("");
}

function renderTranscriptBlock(
  block: TranscriptBlock,
  context: TranscriptBlockRenderContext,
  blockRenderers: readonly TranscriptBlockRenderer[],
): readonly TranscriptLineSegment[][] {
  const renderer = blockRenderers.find((candidate) => candidate.type === block.type);
  if (renderer) return renderer.render(block, context);
  return [];
}

function resolveBlockRenderers(
  customRenderers?: readonly TranscriptBlockRenderer[],
): readonly TranscriptBlockRenderer[] {
  if (!customRenderers) return DEFAULT_BLOCK_RENDERERS;
  return [
    ...customRenderers,
    ...DEFAULT_BLOCK_RENDERERS.filter((defaultRenderer) => (
      !customRenderers.some((customRenderer) => customRenderer.type === defaultRenderer.type)
    )),
  ];
}

function firstLinePrefix(cell: TranscriptCell): string {
  if (cell.kind === "user") return "› ";
  if (cell.kind === "system" && cell.status === "failed") return "! ";
  if (cell.kind === "reasoning") return "· ";
  if (cell.kind === "tool") return "↳ ";
  if (cell.kind === "command") return "$ ";
  if (cell.kind === "file") return "~ ";
  if (cell.kind === "plan") return "» ";
  return "• ";
}

function textToSegments(text: string, width: number): TranscriptLineSegment[][] {
  return wrapTranscriptText(text, width).map((line) => [{ text: line }]);
}

function segmentsOrBody(
  segments: readonly TranscriptLineSegment[],
  bodyText: string,
): readonly TranscriptLineSegment[] {
  return segments.length > 0 ? segments : [{ text: bodyText }];
}

function styleSegment(
  segment: TranscriptLineSegment,
  styles: {
    normal: (value: string) => StyledText["chunks"][number];
    muted: (value: string) => StyledText["chunks"][number];
    strong: (value: string) => StyledText["chunks"][number];
    status: (value: string) => StyledText["chunks"][number];
  },
): StyledText["chunks"][number] {
  if (segment.tone === "muted") return styles.muted(segment.text);
  if (segment.tone === "strong") return styles.strong(segment.text);
  if (segment.tone === "status") return styles.status(segment.text);
  return styles.normal(segment.text);
}
