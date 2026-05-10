import { expect, test } from "bun:test";
import { createTuiState } from "../src/tui/state";
import { TUI_THEMES } from "../src/tui/theme";
import { updateTuiState } from "../src/tui/update";
import { SLASH_COMMANDS } from "../src/tui/commands";
import { buildApprovalOverlayView } from "../src/tui/widgets/approval-overlay";
import { COMPOSER_HEIGHT, COMPOSER_OVERLAY_INSET } from "../src/tui/widgets/composer";
import { footerMode } from "../src/tui/widgets/footer";
import { overlayFrame } from "../src/tui/widgets/overlay";
import {
  buildResumeOverlayView,
  buildThreadRows,
  formatThreadRow,
} from "../src/tui/widgets/resume-picker";
import { buildSlashCommandOverlayView } from "../src/tui/widgets/slash-command-popup";
import { buildStatusLineOverlayView, buildStatusLineRows } from "../src/tui/widgets/statusline-picker";
import { buildThemeOverlayView, buildThemeRows } from "../src/tui/widgets/theme-picker";
import { createStore } from "./tui-test-helpers";

test("overlay anchors above the transient status line and composer", () => {
  expect(COMPOSER_OVERLAY_INSET).toBe(COMPOSER_HEIGHT);
  expect(overlayFrame(100, 30, COMPOSER_OVERLAY_INSET, false)).toEqual({
    left: 0,
    top: 0,
    bottom: undefined,
    width: 100,
    height: 30 - COMPOSER_OVERLAY_INSET,
  });
  expect(overlayFrame(100, 30, COMPOSER_OVERLAY_INSET, true)).toEqual({
    left: 0,
    top: 0,
    bottom: undefined,
    width: 100,
    height: 30,
  });
});

test("theme overlay selects UI themes", async () => {
  const store = await createStore();
  let state = createTuiState(store);

  state = updateTuiState(state, { type: "openTheme" });
  expect(state.overlay).toBe("theme");
  expect(footerMode(state)).toBe("ThemePicker");

  const rows = buildThemeRows(TUI_THEMES, state.themeName, state.themeSelection);
  expect(rows[0].isActive).toBe(true);

  state = updateTuiState(state, { type: "moveTheme", total: TUI_THEMES.length, delta: 1 });
  state = updateTuiState(state, { type: "themeSelected", themeName: TUI_THEMES[state.themeSelection].name });
  expect(state.themeName).toBe(TUI_THEMES[1].name);
  expect(state.overlay).toBe("none");
});

test("resume overlay selects saved threads", async () => {
  const store = await createStore();
  const threads = [
    {
      id: store.id,
      leafId: store.leafId,
      cwd: store.cwd,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      preview: "hello",
      turnCount: 0,
      responseItemCount: 0,
    },
  ];
  const rows = buildThreadRows(threads, store.id, store.id);
  let state = createTuiState(store);

  expect(rows.some((row) => row.id === store.id && row.isCurrent)).toBe(true);

  state = updateTuiState(state, { type: "openThreads", threadId: store.id });
  expect(state.overlay).toBe("threads");

  state = updateTuiState(state, {
    type: "syncThreads",
    threadIds: rows.map((row) => row.id),
    viewportHeight: 4,
  });
  expect(state.selectedThreadId).toBe(store.id);
});

test("resume overlay keeps thread rows single-line and width bounded", () => {
  const row = {
    id: "codex_0123456789",
    isCurrent: false,
    isSelected: true,
    label: "Handover summary for next session:\n\nProject: /Users/biu/Projects/pico\n\nUser intent:\n- long text",
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T12:18:18.000Z",
    preview: "fallback",
    turnCount: 4,
    responseItemCount: 192,
  };

  const line = formatThreadRow(row, 72);

  expect(line).not.toContain("\n");
  expect(line.length).toBeLessThanOrEqual(72);
  expect(line).not.toStartWith(">");
  expect(line).toContain("Handover summary");
  expect(line).not.toContain("codex_01");
  expect(line).not.toContain("Project:");
  expect(line).not.toContain("turns=");
  expect(line).not.toContain("items=");
  expect(line).toEndWith("2026-05-10 12:18:18");
  expect(line.length).toBe(72);
});

test("resume overlay applies renderer width to rows", () => {
  const state = createTuiState();
  const view = buildResumeOverlayView(
    [
      {
        id: "codex_0123456789",
        isCurrent: false,
        isSelected: true,
        label: "one two three four five six seven eight nine ten eleven twelve",
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T12:18:18.000Z",
        preview: "fallback",
        turnCount: 4,
        responseItemCount: 192,
      },
    ],
    state,
    TUI_THEMES[0],
    8,
    80,
  );

  const row = view.rows?.[0];
  expect(row).toBeDefined();
  expect(String(row?.content)).not.toContain("\n");
  expect(String(row?.content).length).toBeLessThanOrEqual(76);
});

test("resume overlay uses themed alternating row backgrounds", () => {
  const state = createTuiState();
  const rows = Array.from({ length: 5 }, (_, index) => ({
    id: `thread-${index}`,
    isCurrent: false,
    isSelected: index === 1,
    label: `thread ${index}`,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T12:18:18.000Z",
    preview: "fallback",
    turnCount: index,
    responseItemCount: index + 10,
  }));
  const theme = TUI_THEMES[0];

  const view = buildResumeOverlayView(rows, state, theme, 4, 80);

  expect(view.content).toBe("");
  expect(view.rows).toHaveLength(5);
  expect(view.rowScrollY).toBe(0);
  expect(view.rows?.[0]?.backgroundColor).toBe(theme.colors.overlayRow);
  expect(view.rows?.[1]?.backgroundColor).toBe(theme.colors.overlayRowSelected);
  expect(view.rows?.[2]?.backgroundColor).toBe(theme.colors.overlayRow);
  expect(view.rows?.[3]?.backgroundColor).toBe(theme.colors.overlayRowAlt);
  expect(String(view.rows?.[0]?.content)).toContain("thread 0");
  expect(String(view.rows?.[3]?.content)).toContain("thread 3");
  expect(String(view.rows?.[4]?.content)).toContain("thread 4");
});

test("navigable picker overlays render row views without textual selection markers", () => {
  const theme = TUI_THEMES[0];
  const state = createTuiState();
  const themeRows = buildThemeRows(TUI_THEMES, state.themeName, 1);
  const statusRows = buildStatusLineRows(["model"], 1);
  const approvalView = buildApprovalOverlayView(
    { id: 1, method: "item/permissions/requestApproval" },
    1,
    theme,
    8,
  );
  const views = [
    buildSlashCommandOverlayView(SLASH_COMMANDS, 1, theme, 8),
    buildThemeOverlayView(themeRows, theme, 8, 1),
    buildStatusLineOverlayView(statusRows, "preview", theme, 8, 1),
    approvalView,
  ];

  for (const view of views) {
    expect(view.rows?.length).toBeGreaterThan(0);
    expect(view.rows?.some((row) => String(row.content).startsWith(">"))).toBe(false);
    expect(view.rows?.some((row) => row.backgroundColor === theme.colors.overlayRowSelected)).toBe(true);
  }
});
