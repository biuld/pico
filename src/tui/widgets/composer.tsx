/** @jsxImportSource @opentui/solid */
import type { InputRenderable, StyledText } from "@opentui/core";
import type { TuiTheme } from "../theme";
export { formatActivityStatus as formatComposerStatus } from "./activity-indicator";
import {
  emptyPendingInputPreview,
  PendingInputPreviewView,
  type PendingInputPreviewState,
} from "./pending-input-preview";
import { SolidText } from "./solid-text";

export const COMPOSER_TRANSIENT_STATUS_HEIGHT = 1;
export const COMPOSER_ROW_HEIGHT = 3;
export const COMPOSER_STATUS_LINE_HEIGHT = 1;
export const COMPOSER_HEIGHT =
  COMPOSER_TRANSIENT_STATUS_HEIGHT + COMPOSER_ROW_HEIGHT + COMPOSER_STATUS_LINE_HEIGHT;
export const COMPOSER_OVERLAY_INSET = COMPOSER_HEIGHT;

export function composerOverlayInset(pendingInputPreviewHeight = 0): number {
  return COMPOSER_HEIGHT + Math.max(0, pendingInputPreviewHeight);
}

export interface ComposerViewProps {
  theme: TuiTheme;
  transientStatus: string;
  placeholder: string;
  statusLine: string | StyledText;
  inputValue: string;
  pendingInputPreview?: PendingInputPreviewState;
  onInput(value: string): void;
  onSubmit(): void;
  onInputRef(input: InputRenderable): void;
}

export function ComposerView(props: ComposerViewProps) {
  const pendingInputPreview = () => props.pendingInputPreview || emptyPendingInputPreview();

  return (
    <box
      id="pico-bottom-pane"
      flexDirection="column"
      width="100%"
      height={composerOverlayInset(pendingInputPreview().height)}
      border={false}
      paddingX={2}
      paddingY={0}
      backgroundColor={props.theme.colors.background}
    >
      <SolidText
        id="pico-transient-status"
        width="100%"
        height={COMPOSER_TRANSIENT_STATUS_HEIGHT}
        content={props.transientStatus}
        fg={props.theme.colors.muted}
        wrapMode="none"
        truncate={true}
      />
      <PendingInputPreviewView
        preview={pendingInputPreview()}
        theme={props.theme}
      />
      <box
        id="pico-composer-row"
        flexDirection="row"
        width="100%"
        height={COMPOSER_ROW_HEIGHT}
        border={["top", "bottom"]}
        borderColor={props.theme.colors.border}
        borderStyle="single"
        paddingX={0}
        paddingY={0}
        backgroundColor={props.theme.colors.background}
      >
        <SolidText
          id="pico-composer-prompt"
          width={2}
          height={1}
          content="› "
          fg={props.theme.colors.textStrong}
          wrapMode="none"
          truncate={true}
        />
        <input
          id="pico-input"
          ref={props.onInputRef}
          flexGrow={1}
          maxLength={8000}
          value={props.inputValue}
          placeholder={props.placeholder}
          textColor={props.theme.colors.text}
          focusedTextColor={props.theme.colors.textStrong}
          backgroundColor={props.theme.colors.background}
          focusedBackgroundColor={props.theme.colors.background}
          placeholderColor={props.theme.colors.placeholder}
          onInput={props.onInput}
          onSubmit={props.onSubmit}
        />
      </box>
      <SolidText
        id="pico-statusline"
        width="100%"
        height={COMPOSER_STATUS_LINE_HEIGHT}
        content={props.statusLine}
        fg={props.theme.colors.status}
        wrapMode="none"
        truncate={true}
      />
    </box>
  );
}
