/** @jsxImportSource @opentui/solid */
import { createEffect, For } from "solid-js";
import type { ScrollBoxRenderable, StyledText } from "@opentui/core";
import type { OverlayContent, OverlayRowView } from "../../core/overlay-model";
import type { TuiTheme } from "../../theme";
import {
  COMPOSER_HEIGHT,
  ComposerView,
  type ComposerViewProps,
} from "./composer";
import { SolidText } from "../solid-text";

export type BottomPanePanelMode = "passive" | "active";
export type BottomPanePanelKind =
  | "none"
  | "approval"
  | "queuedInput"
  | "commandPopup"
  | "themePicker"
  | "statuslinePicker";

export interface BottomPanePanelState {
  visible: boolean;
  mode: BottomPanePanelMode;
  kind: BottomPanePanelKind;
  rows: readonly OverlayRowView[];
  content: OverlayContent;
  selectedIndex: number;
  scrollY: number;
  height: number;
  footer?: string;
}

export interface BottomPaneLayoutState {
  panel: BottomPanePanelState;
  transientStatus: string;
  placeholder: string;
  statusLine: string | StyledText;
  inputValue: string;
}

export function emptyBottomPanePanel(): BottomPanePanelState {
  return {
    visible: false,
    mode: "passive",
    kind: "none",
    rows: [],
    content: "",
    selectedIndex: -1,
    scrollY: 0,
    height: 0,
  };
}

export function bottomPanePanelMaxHeight(rendererHeight: number): number {
  return Math.max(3, Math.floor(Math.max(1, rendererHeight) * 0.30));
}

export function boundedBottomPanePanelHeight(
  contentHeight: number,
  rendererHeight: number,
): number {
  if (contentHeight <= 0) return 0;
  return Math.min(contentHeight, bottomPanePanelMaxHeight(rendererHeight));
}

export function bottomPaneHeight(panel: BottomPanePanelState): number {
  return COMPOSER_HEIGHT + Math.max(0, panel.height);
}

export function BottomPaneView(props: {
  pane: BottomPaneLayoutState;
  theme: TuiTheme;
  onInput: ComposerViewProps["onInput"];
  onSubmit: ComposerViewProps["onSubmit"];
  onInputRef: ComposerViewProps["onInputRef"];
}) {
  return (
    <box
      id="pico-bottom-pane"
      flexDirection="column"
      width="100%"
      height={bottomPaneHeight(props.pane.panel)}
      backgroundColor={props.theme.colors.background}
    >
      <BottomPanePanelView
        panel={props.pane.panel}
        theme={props.theme}
      />
      <ComposerView
        theme={props.theme}
        transientStatus={props.pane.transientStatus}
        placeholder={props.pane.placeholder}
        statusLine={props.pane.statusLine}
        inputValue={props.pane.inputValue}
        onInput={props.onInput}
        onSubmit={props.onSubmit}
        onInputRef={props.onInputRef}
      />
    </box>
  );
}

function BottomPanePanelView(props: {
  panel: BottomPanePanelState;
  theme: TuiTheme;
}) {
  const rows = () => props.panel.rows;
  const hasRows = () => rows().length > 0;
  const footerVisible = () => Boolean(props.panel.footer) && props.panel.height > 1;
  const bodyHeight = () => Math.max(1, props.panel.height - (footerVisible() ? 1 : 0));

  return (
    <box
      id="pico-bottom-pane-panel"
      flexDirection="row"
      width="100%"
      height={props.panel.visible ? props.panel.height : 0}
      visible={props.panel.visible}
      paddingX={2}
      paddingY={0}
      backgroundColor={props.theme.colors.background}
    >
      <box
        id="pico-bottom-pane-panel-gutter-accent"
        width={1}
        height="100%"
        backgroundColor={props.theme.colors.status}
      />
      <box
        id="pico-bottom-pane-panel-gutter-gap"
        width={1}
        height="100%"
        backgroundColor={props.theme.colors.background}
      />
      <box
        id="pico-bottom-pane-panel-body"
        flexDirection="column"
        flexGrow={1}
        height="100%"
        backgroundColor={props.theme.colors.background}
      >
        <SolidText
          id="pico-bottom-pane-panel-text"
          width="100%"
          height={bodyHeight()}
          visible={!hasRows()}
          content={hasRows() ? "" : props.panel.content}
          fg={props.theme.colors.text}
          wrapMode="word"
          truncate={false}
          scrollY={props.panel.scrollY}
        />
        <BottomPanePanelList
          rows={rows()}
          visible={hasRows()}
          height={bodyHeight()}
          scrollTop={Math.max(0, props.panel.scrollY)}
          theme={props.theme}
        />
        <SolidText
          id="pico-bottom-pane-panel-footer"
          width="100%"
          height={1}
          visible={footerVisible()}
          content={props.panel.footer || ""}
          fg={props.theme.colors.muted}
          wrapMode="none"
          truncate={true}
        />
      </box>
    </box>
  );
}

function BottomPanePanelList(props: {
  rows: readonly OverlayRowView[];
  visible: boolean;
  height: number;
  scrollTop: number;
  theme: TuiTheme;
}) {
  let list: ScrollBoxRenderable | undefined;

  createEffect(() => {
    if (list) list.scrollTop = props.scrollTop;
  });

  return (
    <scrollbox
      id="pico-bottom-pane-panel-list"
      ref={(node) => {
        list = node;
      }}
      width="100%"
      height={props.height}
      visible={props.visible}
      scrollX={false}
      scrollY={true}
      backgroundColor={props.theme.colors.background}
      contentOptions={{
        flexDirection: "column",
        backgroundColor: props.theme.colors.background,
      }}
      viewportOptions={{
        backgroundColor: props.theme.colors.background,
      }}
      verticalScrollbarOptions={{
        visible: false,
      }}
      horizontalScrollbarOptions={{
        visible: false,
      }}
    >
      <For each={props.rows}>
        {(row) => <BottomPanePanelRow row={row} theme={props.theme} />}
      </For>
    </scrollbox>
  );
}

function BottomPanePanelRow(props: { row: OverlayRowView; theme: TuiTheme }) {
  return (
    <box
      id={`pico-bottom-pane-panel-row-${safeId(props.row.id)}`}
      flexDirection="row"
      width="100%"
      height={props.row.height || 1}
      backgroundColor={props.row.backgroundColor || props.theme.colors.background}
    >
      <SolidText
        id={`pico-bottom-pane-panel-row-text-${safeId(props.row.id)}`}
        width="100%"
        height={props.row.height || 1}
        flexGrow={1}
        content={props.row.content}
        fg={props.row.foregroundColor || props.theme.colors.text}
        wrapMode="none"
        truncate={true}
      />
    </box>
  );
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}
