import type { TuiState } from "../state";

export const ACTIVITY_SPINNER_INTERVAL_MS = 140;
export const ACTIVITY_SPINNER_FRAMES = [
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
] as const;

export interface ActivityStatusInput {
  running: boolean;
  turnStatus: TuiState["bottomPane"]["turnStatus"];
  statusMessage?: string;
  frame?: number;
  elapsedMs?: number;
}

export function activitySpinnerFrame(frame = 0): string {
  const index = Math.abs(Math.floor(frame)) % ACTIVITY_SPINNER_FRAMES.length;
  return ACTIVITY_SPINNER_FRAMES[index] || ACTIVITY_SPINNER_FRAMES[0];
}

export function formatActivityElapsed(elapsedMs: number | undefined): string {
  if (elapsedMs === undefined || !Number.isFinite(elapsedMs)) return "";
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes === 0) return `${seconds}s`;
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  if (hours === 0) return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

export function formatActivityStatus(input: ActivityStatusInput): string {
  if (input.turnStatus === "failed" && input.statusMessage) return `! ${input.statusMessage}`;
  if (input.running && input.turnStatus === "running") {
    const elapsed = formatActivityElapsed(input.elapsedMs);
    const suffix = elapsed ? ` · ${elapsed}` : "";
    return `${activitySpinnerFrame(input.frame)} ${input.statusMessage || "Working"}${suffix}`;
  }
  if (input.statusMessage) return `• ${input.statusMessage}`;
  return "";
}
