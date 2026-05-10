/** @jsxImportSource @opentui/solid */
import {
  CliRenderEvents,
  type BoxRenderable,
  type CliRenderer,
  type InputRenderable,
  type ScrollBoxRenderable,
  type StyledText,
} from "@opentui/core";
import { render as renderSolid } from "@opentui/solid";
import { createSignal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { emptyOverlay, type OverlayView } from "../overlay-model";
import type { TuiTheme } from "../theme";
import type { TranscriptCell } from "../transcript";
import { COMPOSER_OVERLAY_INSET, ComposerView } from "./composer";
import { OverlaySurface } from "./overlay";
import {
  TranscriptPanelView,
  type TranscriptPanelHandle,
} from "./transcript-panel";
import { createTranscriptSyntaxStyle } from "./transcript-panel/syntax";

export interface OpenTuiLayoutUpdate {
  theme?: TuiTheme;
  width?: number;
  height?: number;
  transcriptCells?: readonly TranscriptCell[];
  composer?: Partial<ComposerLayoutState>;
  overlay?: OverlayView;
}

export interface ComposerLayoutState {
  transientStatus: string;
  placeholder: string;
  statusLine: string | StyledText;
  inputValue: string;
}

export interface OpenTuiInputHandlers {
  onInput?(value: string): void;
  onSubmit?(): void;
}

export interface OpenTuiLayout {
  screen(): BoxRenderable | undefined;
  transcript: TranscriptPanelHandle;
  update(next: OpenTuiLayoutUpdate): void;
  applyTheme(theme: TuiTheme): void;
  applyOverlay(view: OverlayView): void;
  resize(width: number, height: number): void;
  setInputHandlers(handlers: OpenTuiInputHandlers): void;
  focusInput(): void;
  blurInput(): void;
  getInputValue(): string;
  setInputValue(value: string): void;
}

export function createOpenTuiLayout(renderer: CliRenderer, theme: TuiTheme): OpenTuiLayout {
  renderer.root.flexDirection = "column";
  renderer.root.width = "100%";
  renderer.root.height = "100%";

  let screen: BoxRenderable | undefined;
  let input: InputRenderable | undefined;
  let transcriptRoot: ScrollBoxRenderable | undefined;
  let inputHandlers: OpenTuiInputHandlers = {};
  let appliedBackground = theme.colors.background;
  let destroyed = false;

  const [activeTheme, setActiveTheme] = createSignal(theme);
  const [size, setSize] = createSignal({
    width: Math.max(1, renderer.width),
    height: Math.max(1, renderer.height),
  });
  const [transcriptState, setTranscriptState] = createStore<{ cells: TranscriptCell[] }>({
    cells: [],
  });
  const [overlay, setOverlay] = createSignal<OverlayView>(emptyOverlay());
  const [composer, setComposer] = createSignal<ComposerLayoutState>({
    transientStatus: "",
    placeholder: "Ask Pico to do anything",
    statusLine: "",
    inputValue: "",
  });
  const [syntaxStyle, setSyntaxStyle] = createSignal(createTranscriptSyntaxStyle(theme));

  const updateSyntaxStyle = (nextTheme: TuiTheme) => {
    if (activeTheme().name === nextTheme.name) return;
    const previous = syntaxStyle();
    setSyntaxStyle(createTranscriptSyntaxStyle(nextTheme));
    previous.destroy();
  };

  const setComposerInputValue = (value: string) => {
    setComposer((previous) => ({ ...previous, inputValue: value }));
    if (input && input.value !== value) input.value = value;
  };

  const handleInput = (value: string) => {
    setComposer((previous) => ({ ...previous, inputValue: value }));
    inputHandlers.onInput?.(value);
  };

  const handleSubmit = () => {
    inputHandlers.onSubmit?.();
  };

  const update = (next: OpenTuiLayoutUpdate) => {
    if (next.theme) {
      updateSyntaxStyle(next.theme);
      setActiveTheme(next.theme);
      if (appliedBackground !== next.theme.colors.background) {
        appliedBackground = next.theme.colors.background;
        setRendererBackground(renderer, next.theme.colors.background);
      }
    }

    if (next.width !== undefined || next.height !== undefined) {
      setSize((previous) => ({
        width: Math.max(1, next.width ?? previous.width),
        height: Math.max(1, next.height ?? previous.height),
      }));
    }

    if (next.transcriptCells) {
      setTranscriptState(
        "cells",
        reconcile([...next.transcriptCells], { key: "id", merge: true }),
      );
    }

    if (next.composer) {
      setComposer((previous) => ({ ...previous, ...next.composer }));
    }

    if (next.overlay) {
      setOverlay(next.overlay);
    }
  };

  setRendererBackground(renderer, theme.colors.background);
  void renderSolid(() => (
    <box
      ref={(node) => {
        screen = node;
      }}
      id="pico-screen"
      width={size().width}
      height={size().height}
      flexGrow={1}
      flexDirection="column"
      backgroundColor={activeTheme().colors.background}
    >
      <TranscriptPanelView
        cells={transcriptState.cells}
        theme={activeTheme()}
        syntaxStyle={syntaxStyle()}
        onScrollRef={(root) => {
          transcriptRoot = root;
        }}
      />
      <ComposerView
        theme={activeTheme()}
        transientStatus={composer().transientStatus}
        placeholder={composer().placeholder}
        statusLine={composer().statusLine}
        inputValue={composer().inputValue}
        onInput={handleInput}
        onSubmit={handleSubmit}
        onInputRef={(nextInput) => {
          input = nextInput;
        }}
      />
      <OverlaySurface
        view={overlay()}
        theme={activeTheme()}
        rendererWidth={size().width}
        rendererHeight={size().height}
        bottomInset={COMPOSER_OVERLAY_INSET}
      />
    </box>
  ), renderer);

  renderer.on(CliRenderEvents.DESTROY, () => {
    if (destroyed) return;
    destroyed = true;
    syntaxStyle().destroy();
  });

  return {
    screen: () => screen,
    transcript: {
      root: () => transcriptRoot,
      scrollBy: (delta) => {
        transcriptRoot?.scrollBy(delta);
      },
      scrollToBottom: () => {
        if (!transcriptRoot) return;
        transcriptRoot.scrollTo({
          x: 0,
          y: Math.max(0, transcriptRoot.scrollHeight - transcriptRoot.viewport.height),
        });
      },
    },
    update,
    applyTheme: (nextTheme) => update({ theme: nextTheme }),
    applyOverlay: (view) => update({ overlay: view }),
    resize: (width, height) => update({ width, height }),
    setInputHandlers: (handlers) => {
      inputHandlers = handlers;
    },
    focusInput: () => {
      input?.focus();
    },
    blurInput: () => {
      input?.blur();
    },
    getInputValue: () => input?.value ?? composer().inputValue,
    setInputValue: setComposerInputValue,
  };
}

function setRendererBackground(renderer: CliRenderer, color: string): void {
  const themeableRenderer = renderer as CliRenderer & {
    setBackgroundColor?: (color: string) => void;
  };
  themeableRenderer.setBackgroundColor?.(color);
}
