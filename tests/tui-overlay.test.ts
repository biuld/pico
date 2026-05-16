import { expect, test } from "bun:test";
import { createTuiState } from "../src/tui/core/state";
import { TUI_THEMES } from "../src/tui/theme";
import { updateTuiState } from "../src/tui/core/update";
import { SLASH_COMMANDS } from "../src/tui/commands";
import { buildBottomPanePanel } from "../src/tui/surfaces/bottom-pane";
import { buildApprovalPanel } from "../src/tui/widgets/bottom/approval";
import { COMPOSER_HEIGHT, COMPOSER_OVERLAY_INSET } from "../src/tui/widgets/bottom/composer";
import { footerMode } from "../src/tui/widgets/bottom/footer";
import { buildHistoryPickerSurfaceView } from "../src/tui/widgets/pickers/history";
import { pagerOverlayFrame } from "../src/tui/widgets/overlay/surface";
import { buildPendingInputPreview } from "../src/tui/widgets/bottom/pending-input";
import {
  buildResumePickerSurfaceView,
  buildThreadRows,
  formatThreadRow,
} from "../src/tui/widgets/pickers/resume";
import { buildStatusLineRows } from "../src/tui/widgets/pickers/statusline";
import { buildThemeRows } from "../src/tui/widgets/pickers/theme";
import { createStore } from "./tui-test-helpers";

test("pager overlay anchors above the bottom pane", () => {
  expect(COMPOSER_OVERLAY_INSET).toBe(COMPOSER_HEIGHT);
  expect(pagerOverlayFrame(100, 30, COMPOSER_OVERLAY_INSET, false)).toEqual({
    left: 0,
    top: 0,
    bottom: undefined,
    width: 100,
    height: 30 - COMPOSER_OVERLAY_INSET,
  });
  expect(pagerOverlayFrame(100, 30, COMPOSER_OVERLAY_INSET, true)).toEqual({
    left: 0,
    top: 0,
    bottom: undefined,
    width: 100,
    height: 30,
  });
});

test("pending input preview renders queued follow-up inputs without overlay chrome", () => {
  const preview = buildPendingInputPreview({
    text: "first queued prompt with enough words to force truncation in narrow terminals",
  }, 32);

  expect(preview.visible).toBe(true);
  expect(preview.lines[0]).toBe("• Queued follow-up input");
  expect(preview.lines.some((line) => line.includes("first queued prompt"))).toBe(true);
  expect(preview.lines.at(-1)).toBe("  Esc interrupt + send now · Option+Up edit");
  expect(preview.height).toBe(preview.lines.length);

  expect(buildPendingInputPreview(undefined, 32)).toEqual({
    visible: false,
    lines: [],
    height: 0,
  });
});

test("approval panel renders in the composer pane without overlay chrome", () => {
  const panel = buildApprovalPanel({
    id: 1,
    method: "item/permissions/requestApproval",
    params: { reason: "needs workspace access" },
  }, 1, 72);

  expect(panel.visible).toBe(true);
  expect(panel.lines[0]).toBe("  needs workspace access");
  expect(panel.lines).toContain("  needs workspace access");
  expect(panel.lines.join("\n")).not.toContain("reason:");
  expect(panel.lines).toContain("  Yes, grant permissions");
  expect(panel.lines).toContain("  No, deny request");
  expect(panel.selectedLineIndex).toBe(2);
  expect(panel.lines.at(-1)).toBe("  Enter choose · Esc deny · Up/Down move · type to queue");
  expect(panel.height).toBe(panel.lines.length);

  const withoutDetails = buildApprovalPanel({
    id: 2,
    method: "item/permissions/requestApproval",
  }, 0, 72);
  expect(withoutDetails.lines[0]).toBe("  Yes, grant permissions");
  expect(withoutDetails.selectedLineIndex).toBe(0);
  expect(withoutDetails.lines.join("\n")).not.toContain("item/permissions/requestApproval");
});

test("bottom pane renders passive queued input and active approval content", () => {
  const theme = TUI_THEMES[0];
  const state = createTuiState();
  const queued = buildBottomPanePanel({
    state,
    theme,
    queuedMessage: { text: "follow up after the current turn" },
    slashCommands: [],
    themeRows: [],
    statusLineRows: [],
    statusLinePreview: "",
    rendererWidth: 80,
    rendererHeight: 24,
  });

  expect(queued.kind).toBe("queuedInput");
  expect(queued.mode).toBe("passive");
  expect(queued.rows.some((row) => String(row.content).includes("Queued follow-up input"))).toBe(true);

  const approval = buildBottomPanePanel({
    state: updateTuiState(state, { type: "showApproval" }),
    theme,
    pendingApproval: {
      id: 1,
      method: "item/permissions/requestApproval",
      params: { reason: "needs workspace access" },
    },
    slashCommands: [],
    themeRows: [],
    statusLineRows: [],
    statusLinePreview: "",
    rendererWidth: 80,
    rendererHeight: 24,
  });

  expect(approval.kind).toBe("approval");
  expect(approval.mode).toBe("active");
  expect(approval.rows.map((row) => String(row.content)).join("\n")).toContain("needs workspace access");
  expect(approval.rows.map((row) => String(row.content)).join("\n")).not.toContain("item/permissions/requestApproval");
});

test("theme picker is a bottom-pane view", async () => {
  const store = await createStore();
  let state = createTuiState(store);

  state = updateTuiState(state, { type: "openTheme" });
  expect(state.bottomPane.activeView).toBe("themePicker");
  expect(footerMode(state)).toBe("ThemePicker");

  const rows = buildThemeRows(TUI_THEMES, state.themeName, state.themeSelection);
  expect(rows[0].isActive).toBe(true);

  state = updateTuiState(state, { type: "moveTheme", total: TUI_THEMES.length, delta: 1 });
  state = updateTuiState(state, { type: "themeSelected", themeName: TUI_THEMES[state.themeSelection].name });
  expect(state.themeName).toBe(TUI_THEMES[1].name);
  expect(state.bottomPane.activeView).toBe("none");
});

test("resume picker surface selects saved threads", async () => {
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
  expect(state.pickerSurface).toBe("resume");

  state = updateTuiState(state, {
    type: "syncThreads",
    threadIds: rows.map((row) => row.id),
    viewportHeight: 4,
  });
  expect(state.selectedThreadId).toBe(store.id);
});

test("resume picker keeps thread rows single-line and width bounded", () => {
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
  expect(line).toStartWith("  Handover summary");
  expect(line).not.toStartWith("   ");
  expect(line).toContain("Handover summary");
  expect(line).not.toContain("codex_01");
  expect(line).not.toContain("Project:");
  expect(line).not.toContain("turns=");
  expect(line).not.toContain("items=");
  expect(line).toEndWith("2026-05-10 12:18:18");
  expect(line.length).toBe(72);

  const currentLine = formatThreadRow({ ...row, isCurrent: true, label: "current thread" }, 72);
  expect(currentLine).toStartWith("* current thread");
  expect(currentLine).not.toStartWith("*  ");
});

test("resume picker applies renderer width to rows", () => {
  const state = createTuiState();
  const view = buildResumePickerSurfaceView(
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

test("resume picker uses themed alternating row backgrounds", () => {
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

  const view = buildResumePickerSurfaceView(rows, state, theme, 4, 80);

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

test("navigable bottom-pane and picker surfaces render rows without textual selection markers", () => {
  const theme = TUI_THEMES[0];
  const state = createTuiState();
  const commandState = updateTuiState(state, { type: "inputChanged", value: "/" });
  const themeState = updateTuiState(state, { type: "openTheme" });
  const statusState = updateTuiState(state, { type: "openStatusLine" });
  const themeRows = buildThemeRows(TUI_THEMES, state.themeName, 1);
  const statusRows = buildStatusLineRows(["model"], 1);
  const resumeRows = [
    {
      id: "thread-1",
      isCurrent: true,
      isSelected: true,
      label: "current thread",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T12:18:18.000Z",
      preview: "fallback",
      turnCount: 1,
      responseItemCount: 2,
    },
  ];
  const historyRows = [
    {
      id: "entry-1",
      turnId: "turn-1",
      depth: 0,
      isActive: true,
      isSelected: true,
      userPrefix: "└── ",
      summaryPrefix: "    ",
      userText: "restore this turn",
      agentSummary: "agent: summary",
      status: "completed" as const,
    },
  ];
  const rowSets = [
    buildBottomPanePanel({
      state: { ...commandState, slashSelection: 1 },
      theme,
      slashCommands: SLASH_COMMANDS,
      themeRows: [],
      statusLineRows: [],
      statusLinePreview: "",
      rendererWidth: 80,
      rendererHeight: 24,
    }).rows,
    buildResumePickerSurfaceView(resumeRows, state, theme, 8, 80).rows,
    buildHistoryPickerSurfaceView(historyRows, state, theme).rows,
    buildBottomPanePanel({
      state: { ...themeState, themeSelection: 1 },
      theme,
      slashCommands: [],
      themeRows,
      statusLineRows: [],
      statusLinePreview: "",
      rendererWidth: 80,
      rendererHeight: 24,
    }).rows,
    buildBottomPanePanel({
      state: { ...statusState, statusLineSelection: 1 },
      theme,
      slashCommands: [],
      themeRows: [],
      statusLineRows: statusRows,
      statusLinePreview: "preview",
      rendererWidth: 80,
      rendererHeight: 24,
    }).rows,
  ];

  for (const rows of rowSets) {
    expect(rows?.length).toBeGreaterThan(0);
    expect(rows?.some((row) => /(^|\n)\s*>/.test(String(row.content)))).toBe(false);
    expect(rows?.some((row) => row.backgroundColor === theme.colors.overlayRowSelected)).toBe(true);
  }
});
