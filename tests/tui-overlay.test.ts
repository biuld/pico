import { expect, test } from "bun:test";
import { createTuiState } from "../src/tui/state";
import { TUI_THEMES } from "../src/tui/theme";
import { updateTuiState } from "../src/tui/update";
import { COMPOSER_HEIGHT, COMPOSER_OVERLAY_INSET } from "../src/tui/widgets/composer";
import { footerMode } from "../src/tui/widgets/footer";
import { overlayFrame } from "../src/tui/widgets/overlay";
import { buildSessionRows } from "../src/tui/widgets/resume-picker";
import { buildThemeRows } from "../src/tui/widgets/theme-picker";
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

test("resume overlay selects saved sessions", async () => {
  const store = await createStore();
  const sessions = [
    {
      id: store.id,
      leafId: store.leafId,
      cwd: store.cwd,
      createdAt: new Date().toISOString(),
      turnCount: 0,
      responseItemCount: 0,
    },
  ];
  const rows = buildSessionRows(sessions, store.id, store.id);
  let state = createTuiState(store);

  expect(rows.some((row) => row.id === store.id && row.isCurrent)).toBe(true);

  state = updateTuiState(state, { type: "openSessions", sessionId: store.id });
  expect(state.overlay).toBe("sessions");

  state = updateTuiState(state, {
    type: "syncSessions",
    sessionIds: rows.map((row) => row.id),
    viewportHeight: 4,
  });
  expect(state.selectedSessionId).toBe(store.id);
});
