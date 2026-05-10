import { BoxRenderable, type CliRenderer } from "@opentui/core";
import { createComposerWidget, type ComposerWidget } from "./composer";
import { createOverlayWidget, type OverlayWidget } from "./overlay";
import { createTranscriptWidget, type TranscriptWidget } from "./transcript-panel";
import type { OverlayView } from "../overlay-model";
import type { TuiTheme } from "../theme";

export interface OpenTuiLayout {
  screen: BoxRenderable;
  transcript: TranscriptWidget;
  composer: ComposerWidget;
  overlay: OverlayWidget;
  applyTheme(theme: TuiTheme): void;
  applyOverlay(view: OverlayView): void;
  resize(width: number, height: number): void;
}

export function createOpenTuiLayout(renderer: CliRenderer, theme: TuiTheme): OpenTuiLayout {
  renderer.root.flexDirection = "column";
  renderer.root.width = "100%";
  renderer.root.height = "100%";

  const screen = new BoxRenderable(renderer, {
    id: "pico-screen",
    width: "100%",
    height: "100%",
    flexGrow: 1,
    flexDirection: "column",
    backgroundColor: theme.colors.background,
  });
  const transcript = createTranscriptWidget(renderer, theme);
  const composer = createComposerWidget(renderer, theme);
  const overlay = createOverlayWidget(renderer, theme, () => composer.overlayInset);

  renderer.root.add(screen);
  screen.add(transcript.root);
  screen.add(composer.root);
  screen.add(overlay.root);

  let appliedBackground = theme.colors.background;
  const resize = (width: number, height: number) => {
    const nextWidth = Math.max(1, width);
    const nextHeight = Math.max(1, height);
    if (screen.width !== nextWidth) screen.width = nextWidth;
    if (screen.height !== nextHeight) screen.height = nextHeight;
  };
  resize(renderer.width, renderer.height);
  setRendererBackground(renderer, theme.colors.background);

  return {
    screen,
    transcript,
    composer,
    overlay,
    applyTheme: (nextTheme) => {
      if (appliedBackground !== nextTheme.colors.background) {
        appliedBackground = nextTheme.colors.background;
        screen.backgroundColor = nextTheme.colors.background;
        setRendererBackground(renderer, nextTheme.colors.background);
      }
      transcript.applyTheme(nextTheme);
      composer.applyTheme(nextTheme);
      overlay.applyTheme(nextTheme);
    },
    applyOverlay: (view) => {
      overlay.applyView(view);
    },
    resize,
  };
}

function setRendererBackground(renderer: CliRenderer, color: string): void {
  const themeableRenderer = renderer as CliRenderer & {
    setBackgroundColor?: (color: string) => void;
  };
  themeableRenderer.setBackgroundColor?.(color);
}
