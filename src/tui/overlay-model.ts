import type { StyledText } from "@opentui/core";

export interface OverlayRowView {
  id: string;
  content: string | StyledText;
  height?: number;
  foregroundColor?: string;
  backgroundColor?: string;
}

export interface OverlayView {
  visible: boolean;
  title: string;
  fullScreen: boolean;
  scrollY: number;
  content: string | StyledText;
  rows?: readonly OverlayRowView[];
  rowScrollY?: number;
  footer?: string;
}

export function emptyOverlay(): OverlayView {
  return {
    visible: false,
    title: "",
    fullScreen: false,
    scrollY: 0,
    content: "",
    footer: "",
  };
}
