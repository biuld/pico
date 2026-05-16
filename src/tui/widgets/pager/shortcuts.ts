import type { OverlayView } from "../core/overlay-model";
import { OVERLAY_HINTS } from "../overlay/hints";

export function buildShortcutPagerOverlayView(): OverlayView {
  return {
    visible: true,
    title: "Shortcuts",
    fullScreen: false,
    scrollY: 0,
    content: shortcutOverlayText(),
    footer: OVERLAY_HINTS.shortcuts,
  };
}

export function shortcutOverlayText(): string {
  return [
    "Shortcuts",
    "",
    "enter      send composer draft",
    "/          open slash commands",
    "esc esc    open history",
    "ctrl+t     open transcript pager",
    "?          show shortcuts",
    "ctrl+d x2  exit Pico",
    "esc        close overlay",
  ].join("\n");
}
