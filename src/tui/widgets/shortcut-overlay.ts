import type { OverlayView } from "../overlay-model";

export function buildShortcutOverlayView(): OverlayView {
  return {
    visible: true,
    title: "Shortcuts",
    height: 11,
    fullScreen: false,
    scrollY: 0,
    content: shortcutOverlayText(),
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
