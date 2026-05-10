import type { ScrollBoxRenderable } from "@opentui/core";
import type { TranscriptCell } from "../../transcript";
import type { TuiTheme } from "../../theme";

export interface TranscriptWidget {
  root: ScrollBoxRenderable;
  sync(cells: readonly TranscriptCell[], theme?: TuiTheme): void;
  scrollBy(delta: number): void;
  scrollToBottom(): void;
  applyTheme(theme: TuiTheme): void;
}
