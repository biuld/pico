/** @jsxImportSource @opentui/solid */
import { createEffect, For } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { OverlayRowView, OverlayView } from "../core/overlay-model";
import type { TuiTheme } from "../theme";
import { SolidText } from "./solid-text";

export interface PickerSurfaceProps {
  view: OverlayView;
  theme: TuiTheme;
  rendererWidth: number;
  rendererHeight: number;
  bottomInset: number;
}

export function PickerSurface(props: PickerSurfaceProps) {
  const frame = () => pickerSurfaceFrame(
    props.rendererWidth,
    props.rendererHeight,
    props.bottomInset,
  );
  const rows = () => props.view.rows || [];
  const rendersRows = () => rows().length > 0;

  return (
    <box
      id="pico-picker-surface"
      position="absolute"
      zIndex={18}
      visible={props.view.visible}
      flexDirection="column"
      left={props.view.visible ? frame().left : 0}
      top={props.view.visible ? frame().top : 0}
      bottom={undefined}
      width={props.view.visible ? frame().width : "100%"}
      height={props.view.visible ? frame().height : 1}
      title={props.view.visible ? props.view.title : undefined}
      border={true}
      borderColor={props.theme.colors.border}
      backgroundColor="transparent"
    >
      <box
        id="pico-picker-surface-body"
        flexDirection="column"
        width="100%"
        height="100%"
        flexGrow={1}
        paddingX={1}
        paddingY={0}
        backgroundColor={props.theme.colors.overlay}
      >
        <SolidText
          id="pico-picker-surface-text"
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
        <PickerSurfaceList
          rows={rows()}
          visible={rendersRows()}
          scrollTop={Math.max(0, props.view.rowScrollY || 0)}
          theme={props.theme}
        />
        <SolidText
          id="pico-picker-surface-footer"
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

function PickerSurfaceList(props: {
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
      id="pico-picker-surface-list"
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
        {(row) => <PickerSurfaceRow row={row} theme={props.theme} />}
      </For>
    </scrollbox>
  );
}

function PickerSurfaceRow(props: { row: OverlayRowView; theme: TuiTheme }) {
  return (
    <box
      id={`pico-picker-surface-row-${safeId(props.row.id)}`}
      flexDirection="row"
      width="100%"
      height={props.row.height || 1}
      backgroundColor={props.row.backgroundColor || props.theme.colors.overlayRow}
    >
      <SolidText
        id={`pico-picker-surface-row-text-${safeId(props.row.id)}`}
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

export interface PickerSurfaceFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function pickerSurfaceFrame(
  rendererWidth: number,
  rendererHeight: number,
  bottomInset: number,
): PickerSurfaceFrame {
  return {
    left: 0,
    top: 0,
    width: Math.max(1, rendererWidth),
    height: Math.max(1, Math.max(1, rendererHeight) - Math.max(0, bottomInset)),
  };
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}
