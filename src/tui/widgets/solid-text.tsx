/** @jsxImportSource @opentui/solid */
import { createEffect } from "solid-js";
import type { StyledText, TextOptions, TextRenderable } from "@opentui/core";

export interface SolidTextProps extends Omit<TextOptions, "content"> {
  content: string | StyledText;
  scrollY?: number;
}

export function SolidText(props: SolidTextProps) {
  let text: TextRenderable | undefined;

  createEffect(() => {
    if (!text) return;
    text.content = props.content;
    if (props.scrollY !== undefined) text.scrollY = props.scrollY;
  });

  return (
    <text
      ref={(node) => {
        text = node;
      }}
      id={props.id}
      width={props.width}
      height={props.height}
      flexGrow={props.flexGrow}
      flexShrink={props.flexShrink}
      visible={props.visible}
      selectable={props.selectable}
      fg={props.fg}
      bg={props.bg}
      attributes={props.attributes}
      wrapMode={props.wrapMode}
      truncate={props.truncate}
      content={typeof props.content === "string" ? props.content : ""}
    />
  );
}
