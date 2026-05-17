export interface StatusLineThemeColors {
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
}

export interface TuiThemeColors {
  background: string;
  panel: string;
  overlay: string;
  overlayRow: string;
  overlayRowAlt: string;
  overlayRowSelected: string;
  border: string;
  text: string;
  textStrong: string;
  muted: string;
  status: string;
  error: string;
  placeholder: string;
  userMessageBackground: string;
  statusLine: StatusLineThemeColors;
}

interface AccentPalette {
  violet: string;
  blue: string;
  green: string;
  magenta: string;
  cyan: string;
}

interface ThemePalette {
  name: string;
  label: string;
  description: string;
  palette: {
    base: string;
    surface: string;
    surfaceAlt: string;
    surfaceSelected: string;
    border?: string;
    text: string;
    textStrong: string;
    muted: string;
    status: string;
    error?: string;
    placeholder?: string;
    userMessage?: string;
    accents: AccentPalette;
  };
  statusLine?: Partial<StatusLineThemeColors>;
}

const THEME_PALETTES = [
  {
    name: "vscode-dark-modern",
    label: "VS Code Dark Modern",
    description: "VS Code's modern dark workbench palette",
    palette: {
      base: "#1f1f1f",
      surface: "#181818",
      surfaceAlt: "#2b2b2b",
      surfaceSelected: "#313131",
      border: "#3c3c3c",
      text: "#cccccc",
      textStrong: "#ffffff",
      muted: "#9d9d9d",
      status: "#4daafc",
      placeholder: "#989898",
      userMessage: "#2b2b2b",
      accents: {
        violet: "#c586c0",
        blue: "#0078d4",
        green: "#2ea043",
        magenta: "#c586c0",
        cyan: "#4daafc",
      },
    },
  },
  {
    name: "github-dark-default",
    label: "GitHub Dark Default",
    description: "GitHub Primer dark palette used by github.com and its VS Code theme",
    palette: {
      base: "#0d1117",
      surface: "#151b23",
      surfaceAlt: "#212830",
      surfaceSelected: "#2a313c",
      border: "#3d444d",
      text: "#e6edf3",
      textStrong: "#f0f6fc",
      muted: "#7d8590",
      status: "#4493f8",
      placeholder: "#656c76",
      userMessage: "#212830",
      accents: {
        violet: "#d2a8ff",
        blue: "#4493f8",
        green: "#3fb950",
        magenta: "#db61a2",
        cyan: "#39c5cf",
      },
    },
  },
  {
    name: "jetbrains-fleet-dark",
    label: "JetBrains Fleet Dark",
    description: "Fleet UI token palette mapped to dark terminal roles",
    palette: {
      base: "#18191b",
      surface: "#252629",
      surfaceAlt: "#323438",
      surfaceSelected: "#1e3455",
      border: "#4c5157",
      text: "#e0e1e4",
      textStrong: "#f8f8f9",
      muted: "#898e94",
      status: "#6daaf7",
      placeholder: "#6e747b",
      userMessage: "#252629",
      accents: {
        violet: "#a660d4",
        blue: "#0870e4",
        green: "#14835e",
        magenta: "#a31d8d",
        cyan: "#6daaf7",
      },
    },
  },
  {
    name: "github-light-default",
    label: "GitHub Light Default",
    description: "GitHub Primer light palette used by github.com and its VS Code theme",
    palette: {
      base: "#ffffff",
      surface: "#f6f8fa",
      surfaceAlt: "#eff2f5",
      surfaceSelected: "#e6eaef",
      border: "#d1d9e0",
      text: "#1f2328",
      textStrong: "#000000",
      muted: "#656d76",
      status: "#0969da",
      placeholder: "#59636e",
      userMessage: "#f6f8fa",
      accents: {
        violet: "#8250df",
        blue: "#0969da",
        green: "#1f883d",
        magenta: "#bf3989",
        cyan: "#1b7c83",
      },
    },
  },
  {
    name: "vscode-light-modern",
    label: "VS Code Light Modern",
    description: "VS Code's modern light workbench palette",
    palette: {
      base: "#ffffff",
      surface: "#f8f8f8",
      surfaceAlt: "#e5e5e5",
      surfaceSelected: "#e8e8e8",
      border: "#cecece",
      text: "#3b3b3b",
      textStrong: "#1f1f1f",
      muted: "#616161",
      status: "#005fb8",
      placeholder: "#767676",
      userMessage: "#f3f3f3",
      accents: {
        violet: "#6f42c1",
        blue: "#005fb8",
        green: "#2ea043",
        magenta: "#895503",
        cyan: "#26569e",
      },
    },
  },
] as const satisfies readonly ThemePalette[];

export type ThemeName = (typeof THEME_PALETTES)[number]["name"];

export interface TuiTheme {
  name: ThemeName;
  label: string;
  description: string;
  colors: TuiThemeColors;
}

export const TUI_THEMES: readonly TuiTheme[] = THEME_PALETTES.map((theme) => buildTheme(theme));

export const DEFAULT_THEME_NAME: ThemeName = "vscode-dark-modern";

export function getTheme(name: ThemeName): TuiTheme {
  return TUI_THEMES.find((theme) => theme.name === name) || TUI_THEMES[0];
}

export function themeIndex(name: ThemeName): number {
  return Math.max(0, TUI_THEMES.findIndex((theme) => theme.name === name));
}

function buildTheme(theme: ThemePalette & { name: ThemeName }): TuiTheme {
  const palette = theme.palette;
  const border = palette.border || palette.muted;
  const baseStatusLine = statusLineFromAccents(palette.accents, palette.status, border);

  return {
    name: theme.name,
    label: theme.label,
    description: theme.description,
    colors: {
      background: palette.base,
      panel: palette.base,
      overlay: palette.surface,
      overlayRow: palette.surface,
      overlayRowAlt: palette.surfaceAlt,
      overlayRowSelected: palette.surfaceSelected,
      border,
      text: palette.text,
      textStrong: palette.textStrong,
      muted: palette.muted,
      status: palette.status,
      error: palette.error || palette.accents.magenta,
      placeholder: palette.placeholder || palette.muted,
      userMessageBackground: palette.userMessage || palette.surfaceAlt,
      statusLine: {
        ...baseStatusLine,
        ...theme.statusLine,
      },
    },
  };
}

function statusLineFromAccents(
  accents: AccentPalette,
  metadata: string,
  separator: string,
): StatusLineThemeColors {
  return {
    model: accents.violet,
    provider: accents.blue,
    path: accents.green,
    branch: accents.magenta,
    usage: accents.green,
    limit: accents.magenta,
    metadata,
    mode: accents.cyan,
    thread: accents.magenta,
    progress: accents.green,
    separator,
  };
}
