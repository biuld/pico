import { createCliRenderer } from "@opentui/core";
import type { DraftAppState } from "../app/controller";
import { runOpenTuiRuntime } from "./runtime";
import { getTheme } from "./theme";
import { createOpenTuiLayout } from "./widgets/layout";

export async function startOpenTui(app: DraftAppState): Promise<void> {
  const initialTheme = getTheme("vscode-dark-modern");
  const renderer = await createCliRenderer({
    screenMode: "alternate-screen",
    consoleMode: "disabled",
    exitOnCtrlC: false,
    targetFps: 30,
    maxFps: 30,
    useMouse: true,
    backgroundColor: initialTheme.colors.background,
  });

  const layout = createOpenTuiLayout(renderer, initialTheme);
  return runOpenTuiRuntime(renderer, layout, app);
}
