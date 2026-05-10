import type { StyledText } from "@opentui/core";

export interface OverlayView {
  visible: boolean;
  title: string;
  height: number;
  fullScreen: boolean;
  scrollY: number;
  content: string | StyledText;
  footer?: string;
}

export function emptyOverlay(): OverlayView {
  return {
    visible: false,
    title: "",
    height: 1,
    fullScreen: false,
    scrollY: 0,
    content: "",
    footer: "",
  };
}
