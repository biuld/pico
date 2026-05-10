import type { ScrollBoxRenderable } from "@opentui/core";

export interface TranscriptPanelHandle {
  root(): ScrollBoxRenderable | undefined;
  scrollBy(delta: number): void;
  scrollToBottom(): void;
}
