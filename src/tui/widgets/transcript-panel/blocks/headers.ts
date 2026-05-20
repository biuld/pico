import type { TranscriptCommandBlock, TranscriptFileChangeBlock } from "../../../transcript";

// ── formatCwdForHeader ──

export function formatCwdForHeader(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined;
  const segments = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  const base = segments.length > 0 ? segments[segments.length - 1] : cwd;
  if (base.length <= 40) return base;
  return `${base.slice(0, 37)}...`;
}

// ── buildCommandHeader ──

export interface CommandHeaderInfo {
  text: string;
  isFailed: boolean;
  isRunning: boolean;
  statusLabel: string | null;
}

export function buildCommandHeader(
  payload: TranscriptCommandBlock["payload"],
): CommandHeaderInfo {
  const isRunning = payload.status === "running" || payload.status === "inProgress";
  const isFailed = !isRunning && (
    payload.status === "failed" ||
    payload.status === "declined" ||
    (payload.exitCode !== null && payload.exitCode !== undefined && payload.exitCode !== 0)
  );
  let statusLabel: string | null = null;
  if (payload.status === "failed") statusLabel = "FAILED";
  else if (payload.status === "declined") statusLabel = "DECLINED";

  const meta: string[] = [];
  if (isRunning) {
    const cwdDisplay = formatCwdForHeader(payload.cwd);
    if (cwdDisplay) meta.push(cwdDisplay);
    meta.push("RUNNING");
  } else {
    const cwdDisplay = formatCwdForHeader(payload.cwd);
    if (cwdDisplay) meta.push(cwdDisplay);
    if (typeof payload.durationMs === "number") meta.push(`${payload.durationMs}ms`);
    if (payload.exitCode !== null && payload.exitCode !== undefined) meta.push(`exit ${payload.exitCode}`);
    if (statusLabel) meta.push(statusLabel);
  }

  const text = meta.length > 0
    ? `$ ${payload.command}  (${meta.join(" · ")})`
    : `$ ${payload.command}`;

  return { text, isFailed, isRunning, statusLabel };
}

// ── buildFileChangeInfo ──

export interface FileChangeInfo {
  kindSymbol: string;
  headerText: string;
  isFailed: boolean;
  isDeclined: boolean;
  statusLabel: string | null;
  diffLineCount: number | null;
  addedLines: number | null;
  removedLines: number | null;
}

export function buildFileChangeInfo(
  payload: TranscriptFileChangeBlock["payload"],
): FileChangeInfo {
  const kindMap: Record<string, string> = { add: "A", delete: "D", update: "M", modify: "M" };
  const kindSymbol = kindMap[payload.kind ?? ""] ?? "~";
  const isFailed = payload.status === "failed" || payload.status === "declined";
  const isDeclined = payload.status === "declined";
  const statusLabel = isFailed
    ? isDeclined ? "DECLINED" : "FAILED"
    : null;

  const base = `${kindSymbol} ${payload.path || payload.summary || "file change"}`;
  const headerText = statusLabel ? `${base} (${statusLabel})` : base;

  const stats = payload.diff != null ? parseDiffStats(payload.diff) : null;

  return {
    kindSymbol,
    headerText,
    isFailed,
    isDeclined,
    statusLabel,
    diffLineCount: stats ? stats.added + stats.removed : null,
    addedLines: stats?.added ?? null,
    removedLines: stats?.removed ?? null,
  };
}

function parseDiffStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    else if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  return { added, removed };
}

// ── buildToolHeader ──

export function buildToolHeader(
  payload: {
    label?: string;
    argsPreview?: string;
    resultPreview?: string;
    errorMessage?: string;
    durationMs?: number | null;
    detail?: string;
  },
  showDetail: boolean,
): { text: string; hasError: boolean } {
  const parts: string[] = [payload.label ?? ""];
  let hasError = false;
  if (showDetail) {
    if (payload.argsPreview) parts.push(payload.argsPreview);
    if (payload.errorMessage) {
      hasError = true;
    } else if (payload.resultPreview) {
      parts.push(payload.resultPreview);
    }
    if (typeof payload.durationMs === "number") parts.push(`${payload.durationMs}ms`);
    if (!payload.argsPreview && !payload.errorMessage && !payload.resultPreview && payload.detail) {
      parts.push(payload.detail);
    }
  }
  return { text: parts.filter(Boolean).join(" · "), hasError };
}
