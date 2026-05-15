import { picoConfig } from "../config";
import { DEFAULT_STATUS_LINE_ITEMS } from "./statusline";
import { TUI_THEMES } from "./theme";

picoConfig.register({
  key: "theme",
  default: "vscode-dark-modern",
  validate: (v) => {
    if (typeof v !== "string") return "must be a string";
    if (!TUI_THEMES.some((t) => t.name === v)) return `unknown theme: ${v}`;
    return undefined;
  },
  description: "UI theme name",
});

picoConfig.register({
  key: "statusLineItems",
  default: [...DEFAULT_STATUS_LINE_ITEMS],
  validate: (v) => {
    if (!Array.isArray(v)) return "must be an array";
    if (!v.every((s) => typeof s === "string")) return "all items must be strings";
    return undefined;
  },
  description: "Visible status line segments",
});
