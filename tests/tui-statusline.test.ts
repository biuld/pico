import { expect, test } from "bun:test";
import { createTuiState, setTurnStatus } from "../src/tui/state";
import {
  buildStatusLineSegments,
  formatCodexStatusLine,
  formatCodexStatusLineStyled,
  formatConfiguredStatusPreviewText,
  formatConfiguredStatusText,
  statusLineSegmentsText,
} from "../src/tui/statusline";
import { TUI_THEMES } from "../src/tui/theme";
import { updateTuiState } from "../src/tui/update";
import { formatComposerStatus } from "../src/tui/widgets/composer";
import {
  footerMode,
  formatBottomStatusLine,
  formatComposerPlaceholder,
  formatTransientStatusLine,
} from "../src/tui/widgets/footer";
import { OVERLAY_HINTS } from "../src/tui/widgets/overlay-hints";
import {
  buildStatusLineOverlayView,
  buildStatusLineRows,
  formatStatusLineRow,
} from "../src/tui/widgets/statusline-picker";
import { createStore } from "./tui-test-helpers";

test("bottom statusline renders an unsaved thread before first submit", () => {
  const state = createTuiState();

  expect(formatBottomStatusLine(undefined, state, "", 32)).toBe("");
  expect(formatTransientStatusLine("• waiting for model")).toBe("• waiting for model");
  expect(formatTransientStatusLine()).toBe("");
  expect(formatComposerPlaceholder(state)).toBe("Ask Pico to do anything");
  expect(formatComposerPlaceholder(state, 1)).toBe("? for shortcuts");
  expect(formatComposerPlaceholder(setTurnStatus(state, "running"), 1)).toBe("Ctrl+T for transcript");
  expect(formatComposerStatus({ running: false, turnStatus: "idle" })).toBe("");
  expect(formatComposerStatus({ running: true, turnStatus: "running", statusMessage: "starting" })).toBe("• starting");
  expect(formatComposerStatus({
    running: true,
    turnStatus: "running",
    statusMessage: "waiting for model",
    loadingFrame: 2,
  })).toBe("• waiting for model.. ");
  expect(formatCodexStatusLine({
    state,
    codex: { connected: true, turnStatus: "running", model: "gpt-test" },
    items: ["model"],
    width: 48,
  })).toContain("gpt-test");
  expect(formatCodexStatusLine({
    state,
    codex: { connected: true, model: "gpt-test" },
    items: ["model"],
    width: 48,
  })).not.toContain("pico new");
  expect(footerMode(state)).toBe("ComposerEmpty");
});

test("statusline uses themed segments per item type", () => {
  const theme = TUI_THEMES[0];
  const segments = buildStatusLineSegments(
    {
      connected: true,
      turnStatus: "running",
      model: "gpt-test",
      modelProvider: "openai",
      tokenUsage: "12 used",
      threadId: "thread-abcdef",
    },
    undefined,
    ["model", "provider", "used-tokens", "thread-id"],
  );

  expect(segments.map((segment) => segment.kind)).toEqual([
    "model",
    "separator",
    "provider",
    "separator",
    "usage",
    "separator",
    "metadata",
  ]);
  expect(statusLineSegmentsText(segments)).toContain("gpt-test");
  expect(statusLineSegmentsText(segments)).not.toContain("model gpt-test");
  expect(statusLineSegmentsText(segments)).toContain("openai");
  expect(statusLineSegmentsText(segments)).not.toContain("provider openai");

  const styled = formatCodexStatusLineStyled({
    state: createTuiState(),
    codex: {
      connected: true,
      turnStatus: "running",
      model: "gpt-test",
    },
    items: ["model"],
    width: 48,
  }, theme);
  expect(styled.chunks.map((chunk) => chunk.text).join("")).toContain("gpt-test");
  expect(theme.colors.statusLine.model).not.toBe(theme.colors.statusLine.provider);
});

test("statusline command configures visible status line items", async () => {
  const store = await createStore();
  let state = createTuiState(store);
  expect(state.statusLineItems).toContain("model");

  state = updateTuiState(state, { type: "openStatusLine" });
  expect(state.overlay).toBe("statusline");
  expect(footerMode(state)).toBe("StatusLinePicker");
  expect(formatComposerPlaceholder(state)).toBe("");

  const rows = buildStatusLineRows(
    state.statusLineItems,
    state.statusLineSelection,
    (item) => item === "provider" ? "openai" : undefined,
  );
  expect(formatStatusLineRow(rows[0])).toContain("[x] Model");
  expect(formatStatusLineRow(rows[1])).toContain("openai");
  expect(formatStatusLineRow(rows[3])).toContain("[used_tokens]");
  expect(formatConfiguredStatusPreviewText(
    { connected: true },
    store,
    ["model", "five-hour-limit", "thread-id"],
  )).toBe("[model] · [five_hour_limit] · [thread_id]");
  const view = buildStatusLineOverlayView(rows, "openai · gpt-test", TUI_THEMES[0], 8, state.statusLineSelection);
  expect(view.footer).toBe(OVERLAY_HINTS.statusline);

  state = updateTuiState(state, { type: "moveStatusLine", total: rows.length, delta: 2 });
  state = updateTuiState(state, { type: "toggleStatusLineItem", item: "current-dir" });
  expect(state.statusLineItems).toContain("current-dir");

  expect(formatConfiguredStatusText(
    { connected: true, turnStatus: "running", modelProvider: "openai" },
    store,
    state.statusLineItems,
  )).toContain("openai");
});
