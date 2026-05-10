/** @jsxImportSource @opentui/solid */
import { StyledText, dim, fg } from "@opentui/core";
import type { CodexStatusSnapshot } from "../../codex/app-server";
import type { TuiTheme } from "../theme";
import { SolidText } from "./solid-text";

export const STARTUP_BANNER_HEIGHT = 9;
const STARTUP_BANNER_BOX_HEIGHT = 7;
const STARTUP_BANNER_MAX_WIDTH = 82;
const LABEL_WIDTH = 13;

export interface StartupBannerState {
  visible: boolean;
  width: number;
  title: string;
  subtitle: string;
  model: string;
  modelReasoningEffort?: string;
  serviceTier?: string;
  cwd: string;
}

export interface StartupBannerInput {
  visible: boolean;
  codex: CodexStatusSnapshot;
  cwd: string;
  rendererWidth: number;
  home?: string;
}

export function buildStartupBannerState(input: StartupBannerInput): StartupBannerState {
  const version = codexVersionLabel(input.codex.userAgent);
  return {
    visible: input.visible,
    width: startupBannerWidth(input.rendererWidth),
    title: "Pico",
    subtitle: version ? `powered by Codex ${version}` : "powered by Codex",
    model: input.codex.model || "loading model",
    modelReasoningEffort: input.codex.modelReasoningEffort,
    serviceTier: input.codex.serviceTier,
    cwd: formatStartupCwd(input.cwd, input.home),
  };
}

export function startupBannerWidth(rendererWidth: number): number {
  return Math.max(1, Math.min(STARTUP_BANNER_MAX_WIDTH, Math.max(1, rendererWidth - 4)));
}

export function codexVersionLabel(userAgent?: string): string | undefined {
  const version = userAgent?.match(/\b(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/)?.[1];
  return version ? `v${version}` : undefined;
}

export function formatStartupCwd(cwd: string, home = Bun.env.HOME || process.env.HOME): string {
  if (!home) return cwd;
  const normalizedHome = home.replace(/\/+$/, "");
  if (!normalizedHome) return cwd;
  if (cwd === normalizedHome) return "~";
  return cwd.startsWith(`${normalizedHome}/`) ? `~${cwd.slice(normalizedHome.length)}` : cwd;
}

export function StartupBannerView(props: {
  banner: StartupBannerState;
  theme: TuiTheme;
}) {
  return (
    <box
      id="pico-startup-banner-region"
      width="100%"
      height={STARTUP_BANNER_HEIGHT}
      paddingX={2}
      paddingY={1}
      backgroundColor={props.theme.colors.background}
    >
      <box
        id="pico-startup-banner"
        width={props.banner.width}
        height={STARTUP_BANNER_BOX_HEIGHT}
        border={true}
        borderColor={props.theme.colors.border}
        flexDirection="column"
        paddingX={2}
        paddingY={0}
        backgroundColor={props.theme.colors.background}
      >
        <SolidText
          id="pico-startup-banner-title"
          width="100%"
          height={1}
          content={startupTitleText(props.banner, props.theme)}
          fg={props.theme.colors.textStrong}
          wrapMode="none"
          truncate={true}
        />
        <SolidText
          id="pico-startup-banner-subtitle"
          width="100%"
          height={1}
          content={startupSubtitleText(props.banner, props.theme)}
          fg={props.theme.colors.muted}
          wrapMode="none"
          truncate={true}
        />
        <SolidText
          id="pico-startup-banner-spacer"
          width="100%"
          height={1}
          content=""
          fg={props.theme.colors.text}
          wrapMode="none"
          truncate={true}
        />
        <SolidText
          id="pico-startup-banner-model"
          width="100%"
          height={1}
          content={startupModelText(props.banner, props.theme)}
          fg={props.theme.colors.text}
          wrapMode="none"
          truncate={true}
        />
        <SolidText
          id="pico-startup-banner-directory"
          width="100%"
          height={1}
          content={startupDirectoryText(props.banner, props.theme)}
          fg={props.theme.colors.text}
          wrapMode="none"
          truncate={true}
        />
      </box>
    </box>
  );
}

export function startupTitleText(banner: StartupBannerState, theme: TuiTheme): StyledText {
  return new StyledText([
    dim(fg(theme.colors.muted)(">_  ")),
    fg(theme.colors.textStrong)(banner.title),
  ]);
}

export function startupSubtitleText(banner: StartupBannerState, theme: TuiTheme): StyledText {
  return new StyledText([
    fg(theme.colors.muted)("    "),
    dim(fg(theme.colors.muted)(banner.subtitle)),
  ]);
}

export function startupModelText(banner: StartupBannerState, theme: TuiTheme): StyledText {
  const chunks = [
    fg(theme.colors.muted)(startupLabel("model:")),
    fg(theme.colors.textStrong)(banner.model),
  ];

  if (banner.modelReasoningEffort) {
    chunks.push(fg(theme.colors.textStrong)(` ${banner.modelReasoningEffort}`));
  }
  if (banner.serviceTier) {
    chunks.push(fg(theme.colors.statusLine.branch)(`   ${banner.serviceTier}`));
  }

  chunks.push(
    fg(theme.colors.statusLine.mode)("   /model"),
    fg(theme.colors.muted)(" to change"),
  );

  return new StyledText(chunks);
}

export function startupDirectoryText(banner: StartupBannerState, theme: TuiTheme): StyledText {
  return new StyledText([
    fg(theme.colors.muted)(startupLabel("directory:")),
    fg(theme.colors.textStrong)(banner.cwd),
  ]);
}

function startupLabel(label: string): string {
  return label.padEnd(LABEL_WIDTH, " ");
}
