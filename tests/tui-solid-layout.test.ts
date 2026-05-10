import { expect, test } from "bun:test";
import { fg, StyledText, type BaseRenderable } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import { createOpenTuiLayout } from "../src/tui/widgets/layout";
import { TUI_THEMES } from "../src/tui/theme";

test("solid layout bridge updates composer text and input handlers", async () => {
  const { renderer, mockInput, renderOnce, captureCharFrame } = await createTestRenderer({
    width: 60,
    height: 12,
  });
  const layout = createOpenTuiLayout(renderer, TUI_THEMES[0]);
  let lastInput = "";
  let submitCount = 0;

  layout.setInputHandlers({
    onInput: (value) => {
      lastInput = value;
    },
    onSubmit: () => {
      submitCount += 1;
    },
  });
  layout.update({
    width: 60,
    height: 12,
    theme: TUI_THEMES[0],
    composer: {
      transientStatus: "• ready",
      placeholder: "Ask Pico",
      statusLine: new StyledText([fg(TUI_THEMES[0].colors.statusLine.model)("gpt-test")]),
    },
    transcriptCells: [
      {
        id: "turn-1",
        kind: "user_message",
        status: "completed",
        blocks: [{ type: "text", payload: { text: "hello", tone: "strong" } }],
      },
    ],
  });

  layout.focusInput();
  await mockInput.typeText("abc");
  mockInput.pressEnter();
  await renderOnce();

  expect(layout.getInputValue()).toBe("abc");
  expect(lastInput).toBe("abc");
  expect(submitCount).toBe(1);
  expect(captureCharFrame()).toContain("gpt-test");

  layout.update({
    overlay: {
      visible: true,
      title: "Solid Overlay",
      fullScreen: false,
      scrollY: 0,
      content: "",
      rows: [
        {
          id: "row-1",
          content: "row content",
          backgroundColor: TUI_THEMES[0].colors.overlayRowSelected,
        },
      ],
      footer: "footer text",
    },
  });
  await renderOnce();

  expect(captureCharFrame()).toContain("row content");
  expect(captureCharFrame()).toContain("footer text");

  renderer.destroy();
});

test("solid transcript reconcile preserves stable cell and block renderables", async () => {
  const { renderer, renderOnce } = await createTestRenderer({
    width: 60,
    height: 12,
  });
  const layout = createOpenTuiLayout(renderer, TUI_THEMES[0]);

  layout.update({
    width: 60,
    height: 12,
    theme: TUI_THEMES[0],
    transcriptCells: [
      {
        id: "turn-1",
        kind: "user_message",
        status: "completed",
        blocks: [{ type: "text", payload: { text: "hello", tone: "strong" } }],
      },
      {
        id: "live",
        kind: "assistant_markdown",
        blocks: [{ type: "markdown", payload: { text: "first", streaming: true } }],
      },
    ],
  });
  await renderOnce();

  const stableCell = mustFind(renderer.root, "pico-transcript-cell-turn-1-0");
  const liveCell = mustFind(renderer.root, "pico-transcript-cell-live-1");
  const liveBlock = mustFind(renderer.root, "pico-transcript-block-live-0");

  layout.update({
    transcriptCells: [
      {
        id: "turn-1",
        kind: "user_message",
        status: "completed",
        blocks: [{ type: "text", payload: { text: "hello", tone: "strong" } }],
      },
      {
        id: "live",
        kind: "assistant_markdown",
        blocks: [{ type: "markdown", payload: { text: "first second", streaming: true } }],
      },
    ],
  });
  await renderOnce();

  expect(mustFind(renderer.root, "pico-transcript-cell-turn-1-0")).toBe(stableCell);
  expect(mustFind(renderer.root, "pico-transcript-cell-live-1")).toBe(liveCell);
  expect(mustFind(renderer.root, "pico-transcript-block-live-0")).toBe(liveBlock);

  renderer.destroy();
});

function mustFind(root: BaseRenderable, id: string): BaseRenderable {
  const renderable = root.findDescendantById(id);
  expect(renderable).toBeDefined();
  return renderable!;
}
