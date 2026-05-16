import { StyledText, dim, fg } from "@opentui/core";
import type { CodexStatusSnapshot } from "../codex/app-server";
import type { CodexThreadState } from "../app/codex-thread-state";
import type { TuiState } from "./core/state";
import type { TuiTheme } from "./theme";

export type StatusLineItemId =
  | "model"
  | "provider"
  | "current-dir"
  | "used-tokens"
  | "five-hour-limit"
  | "weekly-limit"
  | "thread-id";

export const DEFAULT_STATUS_LINE_ITEMS: readonly StatusLineItemId[] = [
  "model",
  "provider",
  "used-tokens",
  "five-hour-limit",
  "weekly-limit",
];

export const STATUS_LINE_ITEM_IDS: readonly StatusLineItemId[] = [
  "model",
  "provider",
  "current-dir",
  "used-tokens",
  "five-hour-limit",
  "weekly-limit",
  "thread-id",
];

export type StatusLineSegmentKind =
  | "model"
  | "provider"
  | "path"
  | "branch"
  | "usage"
  | "limit"
  | "metadata"
  | "mode"
  | "thread"
  | "progress"
  | "separator";

export interface StatusLineSegment {
  text: string;
  kind: StatusLineSegmentKind;
  item?: StatusLineItemId;
}

export interface StatusLineInput {
  store?: CodexThreadState;
  state: TuiState;
  codex: CodexStatusSnapshot;
  items?: readonly StatusLineItemId[];
  width?: number;
}

export function formatCodexStatusLine(input: StatusLineInput): string {
  return statusLineSegmentsText(buildAlignedStatusLineSegments(input));
}

export function formatCodexStatusLineStyled(
  input: StatusLineInput,
  theme: TuiTheme,
): StyledText {
  return statusLineSegmentsStyled(buildAlignedStatusLineSegments(input), theme);
}

export function buildAlignedStatusLineSegments(input: StatusLineInput): StatusLineSegment[] {
  const leftSegments = buildStatusLineSegments(
    input.codex,
    input.store,
    input.items || DEFAULT_STATUS_LINE_ITEMS,
  );
  return alignSegments(leftSegments);
}

export function formatConfiguredStatusText(
  codex: CodexStatusSnapshot,
  store: CodexThreadState | undefined,
  items: readonly StatusLineItemId[],
): string {
  return statusLineSegmentsText(buildStatusLineSegments(codex, store, items));
}

export function formatConfiguredStatusPreviewText(
  codex: CodexStatusSnapshot,
  store: CodexThreadState | undefined,
  items: readonly StatusLineItemId[],
): string {
  return statusLineSegmentsText(buildStatusLinePreviewSegments(codex, store, items));
}

export function buildStatusLineSegments(
  codex: CodexStatusSnapshot,
  store: CodexThreadState | undefined,
  items: readonly StatusLineItemId[],
): StatusLineSegment[] {
  const values: StatusLineSegment[] = [];
  values.push(...items
    .map((item) => statusLineItemSegment(item, codex, store))
    .filter((value): value is StatusLineSegment => Boolean(value)));

  return withSeparators(values);
}

export function buildStatusLinePreviewSegments(
  codex: CodexStatusSnapshot,
  store: CodexThreadState | undefined,
  items: readonly StatusLineItemId[],
): StatusLineSegment[] {
  const values: StatusLineSegment[] = [];
  values.push(...items.map((item) =>
    statusLineItemSegment(item, codex, store) || statusLineItemPlaceholderSegment(item)
  ));

  return withSeparators(values);
}

export function normalizeStatusLineItems(items?: readonly string[]): StatusLineItemId[] {
  if (!items) return [...DEFAULT_STATUS_LINE_ITEMS];
  const normalized: StatusLineItemId[] = [];
  for (const item of items) {
    const normalizedItem = normalizeStatusLineItem(item);
    if (normalizedItem && !normalized.includes(normalizedItem)) {
      normalized.push(normalizedItem);
    }
  }
  return normalized;
}

export function isStatusLineItemId(item: string): item is StatusLineItemId {
  return (STATUS_LINE_ITEM_IDS as readonly string[]).includes(item);
}

export function statusLineItemValue(
  item: StatusLineItemId,
  codex: CodexStatusSnapshot,
  store: CodexThreadState | undefined,
): string | undefined {
  return statusLineItemSegment(item, codex, store)?.text;
}

export function statusLineItemPlaceholder(item: StatusLineItemId): string {
  return `[${statusLineItemSegmentName(item)}]`;
}

export function statusLineItemSegmentName(item: StatusLineItemId): string {
  return item.replaceAll("-", "_");
}

function normalizeStatusLineItem(item: string): StatusLineItemId | undefined {
  if (isStatusLineItemId(item)) return item;
  if (item === "tokens") return "used-tokens";
  if (item === "rate-limits") return "five-hour-limit";
  if (item === "cwd") return "current-dir";
  return undefined;
}

function statusLineItemSegment(
  item: StatusLineItemId,
  codex: CodexStatusSnapshot,
  store: CodexThreadState | undefined,
): StatusLineSegment | undefined {
  switch (item) {
    case "model":
      return codex.model ? { text: codex.model, kind: "model", item } : undefined;
    case "provider":
      return codex.modelProvider ? { text: codex.modelProvider, kind: "provider", item } : undefined;
    case "current-dir":
      return store?.cwd ? { text: cwdBasename(store.cwd), kind: "path", item } : undefined;
    case "used-tokens":
      return codex.tokenUsage ? { text: codex.tokenUsage, kind: "usage", item } : undefined;
    case "five-hour-limit":
      return codex.fiveHourLimit || codex.rateLimits
        ? { text: codex.fiveHourLimit || codex.rateLimits!, kind: "limit", item }
        : undefined;
    case "weekly-limit":
      return codex.weeklyLimit ? { text: codex.weeklyLimit, kind: "limit", item } : undefined;
    case "thread-id":
      return codex.threadId ? { text: shortId(codex.threadId), kind: "metadata", item } : undefined;
  }
}

function statusLineItemPlaceholderSegment(item: StatusLineItemId): StatusLineSegment {
  return {
    text: statusLineItemPlaceholder(item),
    kind: statusLineItemSegmentKind(item),
    item,
  };
}

function statusLineItemSegmentKind(item: StatusLineItemId): StatusLineSegmentKind {
  switch (item) {
    case "model":
      return "model";
    case "provider":
      return "provider";
    case "current-dir":
      return "path";
    case "used-tokens":
      return "usage";
    case "five-hour-limit":
    case "weekly-limit":
      return "limit";
    case "thread-id":
      return "metadata";
  }
}

function withSeparators(values: readonly StatusLineSegment[]): StatusLineSegment[] {
  const result: StatusLineSegment[] = [];
  values.forEach((value, index) => {
    if (index > 0) result.push({ text: " · ", kind: "separator" });
    result.push(value);
  });
  return result;
}

function alignSegments(left: readonly StatusLineSegment[]): StatusLineSegment[] {
  const indentedLeft = left.length > 0
    ? [{ text: "  ", kind: "separator" } satisfies StatusLineSegment, ...left]
    : [];
  return indentedLeft;
}

export function statusLineSegmentsText(segments: readonly StatusLineSegment[]): string {
  return segments.map((segment) => segment.text).join("");
}

export function statusLineSegmentsStyled(
  segments: readonly StatusLineSegment[],
  theme: TuiTheme,
): StyledText {
  const chunks = segments.map((segment) => {
    const color = theme.colors.statusLine[segment.kind];
    const styled = fg(color)(segment.text);
    return segment.kind === "separator" ? dim(styled) : styled;
  });
  return new StyledText(chunks);
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function cwdBasename(cwd: string): string {
  const normalized = cwd.replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts.at(-1) || normalized || "/";
}
