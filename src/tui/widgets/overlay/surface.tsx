/** @jsxImportSource @opentui/solid */
import { createEffect, For } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { OverlayRowView, OverlayView } from "../core/overlay-model";
import type { TuiTheme } from "../../theme";
import { SolidText } from "../solid-text";

export interface PagerOverlaySurfaceProps {
  view: OverlayView;
  theme: TuiTheme;
  rendererWidth: number;
  rendererHeight: number;
  bottomInset: number;
}

export interface OverlayFrame {
  left: number;
  top: number;
  bottom: number | undefined;
  width: number;
  height: number;
}

export function PagerOverlaySurface(props: PagerOverlaySurfaceProps) {
  const frame = () => pagerOverlayFrame(
    props.rendererWidth,
    props.rendererHeight,
    props.bottomInset,
    props.view.fullScreen,
  );
  const rows = () => props.view.rows || [];
  const rendersRows = () => rows().length > 0;

  return (
    <box
      id="pico-overlay"
      position="absolute"
      zIndex={20}
      visible={props.view.visible}
      flexDirection="column"
      left={props.view.visible ? frame().left : 0}
      top={props.view.visible ? frame().top : 0}
      bottom={props.view.visible ? frame().bottom : undefined}
      width={props.view.visible ? frame().width : "100%"}
      height={props.view.visible ? frame().height : 1}
      title={props.view.visible ? props.view.title : undefined}
      border={true}
      borderColor={props.theme.colors.border}
      backgroundColor="transparent"
    >
      <box
        id="pico-overlay-body"
        flexDirection="column"
        width="100%"
        height="100%"
        flexGrow={1}
        paddingX={1}
        paddingY={0}
        backgroundColor={props.theme.colors.overlay}
      >
        <SolidText
          id="pico-overlay-text"
          width="100%"
          height={1}
          flexGrow={1}
          visible={!rendersRows()}
          content={rendersRows() ? "" : props.view.content}
          fg={props.theme.colors.text}
          wrapMode="word"
          truncate={false}
          scrollY={props.view.scrollY}
        />
        <OverlayList
          rows={rows()}
          visible={rendersRows()}
          scrollTop={Math.max(0, props.view.rowScrollY || 0)}
          theme={props.theme}
        />
        <SolidText
          id="pico-overlay-footer"
          width="100%"
          height={1}
          visible={Boolean(props.view.footer)}
          content={props.view.footer || ""}
          fg={props.theme.colors.muted}
          wrapMode="none"
          truncate={true}
        />
      </box>
    </box>
  );
}

function OverlayList(props: {
  rows: readonly OverlayRowView[];
  visible: boolean;
  scrollTop: number;
  theme: TuiTheme;
}) {
  let list: ScrollBoxRenderable | undefined;

  createEffect(() => {
    if (list) list.scrollTop = props.scrollTop;
  });

  return (
    <scrollbox
      id="pico-overlay-list"
      ref={(node) => {
        list = node;
      }}
      width="100%"
      height={1}
      flexGrow={1}
      visible={props.visible}
      scrollX={false}
      scrollY={true}
      backgroundColor={props.theme.colors.overlay}
      contentOptions={{
        flexDirection: "column",
        backgroundColor: props.theme.colors.overlay,
      }}
      viewportOptions={{
        backgroundColor: props.theme.colors.overlay,
      }}
      verticalScrollbarOptions={{
        visible: false,
      }}
      horizontalScrollbarOptions={{
        visible: false,
      }}
    >
      <For each={props.rows}>
        {(row) => <OverlayRow row={row} theme={props.theme} />}
      </For>
    </scrollbox>
  );
}

function OverlayRow(props: { row: OverlayRowView; theme: TuiTheme }) {
  return (
    <box
      id={`pico-overlay-row-${safeId(props.row.id)}`}
      flexDirection="row"
      width="100%"
      height={props.row.height || 1}
      backgroundColor={props.row.backgroundColor || props.theme.colors.overlayRow}
    >
      <SolidText
        id={`pico-overlay-row-text-${safeId(props.row.id)}`}
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

export function pagerOverlayFrame(
  rendererWidth: number,
  rendererHeight: number,
  bottomInset: number,
  fullScreen: boolean,
): OverlayFrame {
  const width = Math.max(1, rendererWidth);
  const height = Math.max(1, rendererHeight);

  if (fullScreen) {
    return {
      left: 0,
      top: 0,
      bottom: undefined,
      width,
      height,
    };
  }

  return {
    left: 0,
    top: 0,
    bottom: undefined,
    width,
    height: Math.max(1, height - Math.max(0, bottomInset)),
  };
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}
