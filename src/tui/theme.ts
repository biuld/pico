export type ThemeName = "codex-dark" | "paper" | "mono";

export interface TuiTheme {
  name: ThemeName;
  label: string;
  description: string;
  colors: {
    background: string;
    panel: string;
    overlay: string;
    border: string;
    text: string;
    textStrong: string;
    muted: string;
    status: string;
    placeholder: string;
    userMessageBackground: string;
    statusLine: {
      model: string;
      provider: string;
      path: string;
      branch: string;
      usage: string;
      limit: string;
      metadata: string;
      mode: string;
      thread: string;
      progress: string;
      separator: string;
    };
  };
}

export const TUI_THEMES: readonly TuiTheme[] = [
  {
    name: "codex-dark",
    label: "Codex Dark",
    description: "low-contrast dark terminal palette",
    colors: {
      background: "#0b0d0f",
      panel: "#0b0d0f",
      overlay: "#101418",
      border: "#52606c",
      text: "#e5e9ee",
      textStrong: "#ffffff",
      muted: "#77838e",
      status: "#9fb0bf",
      placeholder: "#6f7b86",
      userMessageBackground: "#1b2127",
      statusLine: {
        model: "#c4b5fd",
        provider: "#93c5fd",
        path: "#86efac",
        branch: "#f0abfc",
        usage: "#86efac",
        limit: "#f0abfc",
        metadata: "#9fb0bf",
        mode: "#7dd3fc",
        thread: "#f0abfc",
        progress: "#86efac",
        separator: "#52606c",
      },
    },
  },
  {
    name: "paper",
    label: "Paper",
    description: "light palette for bright terminals",
    colors: {
      background: "#f7f4ed",
      panel: "#f7f4ed",
      overlay: "#ebe5da",
      border: "#8d7f6f",
      text: "#24201b",
      textStrong: "#111111",
      muted: "#6d6257",
      status: "#4f6f68",
      placeholder: "#8a8178",
      userMessageBackground: "#e8dfd2",
      statusLine: {
        model: "#6d28d9",
        provider: "#1d4ed8",
        path: "#15803d",
        branch: "#a21caf",
        usage: "#15803d",
        limit: "#a21caf",
        metadata: "#4f6f68",
        mode: "#075985",
        thread: "#a21caf",
        progress: "#15803d",
        separator: "#8d7f6f",
      },
    },
  },
  {
    name: "mono",
    label: "Mono",
    description: "high-contrast grayscale palette",
    colors: {
      background: "#050505",
      panel: "#050505",
      overlay: "#151515",
      border: "#808080",
      text: "#eeeeee",
      textStrong: "#ffffff",
      muted: "#a0a0a0",
      status: "#c0c0c0",
      placeholder: "#777777",
      userMessageBackground: "#1f1f1f",
      statusLine: {
        model: "#d0d0d0",
        provider: "#b8b8b8",
        path: "#e0e0e0",
        branch: "#c8c8c8",
        usage: "#e0e0e0",
        limit: "#c8c8c8",
        metadata: "#c0c0c0",
        mode: "#ffffff",
        thread: "#c8c8c8",
        progress: "#e0e0e0",
        separator: "#808080",
      },
    },
  },
];

export const DEFAULT_THEME_NAME: ThemeName = "codex-dark";

export function getTheme(name: ThemeName): TuiTheme {
  return TUI_THEMES.find((theme) => theme.name === name) || TUI_THEMES[0];
}

export function themeIndex(name: ThemeName): number {
  return Math.max(0, TUI_THEMES.findIndex((theme) => theme.name === name));
}
