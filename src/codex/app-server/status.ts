import type {
  CodexConfig,
  ConfigReadResponse,
  InitializeResponse,
  JSONRPCNotification,
  ModelListResponse,
  ThreadStartResponse,
  TurnStartResponse,
} from "./types";
import { numberValue, objectParam, stringValue, type TurnCompletedParams } from "./events";

export interface CodexStatusSource {
  userAgent?: string;
  codexHome?: string;
}

export interface CodexStatusSnapshot {
  connected: boolean;
  userAgent?: string;
  codexHome?: string;
  threadId?: string;
  threadStatus?: string;
  turnId?: string;
  turnStatus?: string;
  model?: string;
  modelProvider?: string;
  modelReasoningEffort?: string;
  serviceTier?: string;
  tokenUsage?: string;
  rateLimits?: string;
  fiveHourLimit?: string;
  weeklyLimit?: string;
  lastNotice?: string;
}

export function createCodexStatusSnapshot(source?: CodexStatusSource): CodexStatusSnapshot {
  return {
    connected: Boolean(source?.userAgent || source?.codexHome),
    userAgent: source?.userAgent,
    codexHome: source?.codexHome,
  };
}

export function updateCodexStatusFromInitialize(
  status: CodexStatusSnapshot,
  response: InitializeResponse,
): CodexStatusSnapshot {
  return {
    ...status,
    connected: true,
    userAgent: response.userAgent,
    codexHome: response.codexHome,
  };
}

export function updateCodexStatusFromConfig(
  status: CodexStatusSnapshot,
  config: CodexConfig,
): CodexStatusSnapshot {
  const model = stringConfigValue(config.model);
  const modelProvider = stringConfigValue(config.modelProvider) ||
    stringConfigValue(config.model_provider);
  const modelReasoningEffort = stringConfigValue(config.modelReasoningEffort) ||
    stringConfigValue(config.model_reasoning_effort);
  const serviceTier = stringConfigValue(config.serviceTier) ||
    stringConfigValue(config.service_tier);

  return {
    ...status,
    model: model || status.model,
    modelProvider: modelProvider || status.modelProvider,
    modelReasoningEffort: modelReasoningEffort || status.modelReasoningEffort,
    serviceTier: serviceTier || status.serviceTier,
  };
}

export function updateCodexStatusFromConfigRead(
  status: CodexStatusSnapshot,
  response: ConfigReadResponse,
): CodexStatusSnapshot {
  return updateCodexStatusFromConfig(status, response.config);
}

export function updateCodexStatusFromModelList(
  status: CodexStatusSnapshot,
  response: ModelListResponse,
): CodexStatusSnapshot {
  const selectedModel = status.model
    ? response.data.find((model) => model.model === status.model || model.id === status.model)
    : undefined;
  const defaultModel = selectedModel || response.data.find((model) => model.isDefault) || response.data[0];
  if (!defaultModel?.model) return status;

  return {
    ...status,
    model: status.model || defaultModel.model,
    modelReasoningEffort: status.modelReasoningEffort ||
      stringConfigValue(defaultModel.defaultReasoningEffort),
  };
}

export function updateCodexStatusFromThreadStart(
  status: CodexStatusSnapshot,
  response: ThreadStartResponse,
): CodexStatusSnapshot {
  return {
    ...status,
    connected: true,
    threadId: response.thread.id,
    threadStatus: normalizeCodexStatusValue(response.thread.status) || status.threadStatus,
    model: response.model,
    modelProvider: response.modelProvider,
    modelReasoningEffort: stringConfigValue(response.reasoningEffort) || status.modelReasoningEffort,
    serviceTier: stringConfigValue(response.serviceTier) || status.serviceTier,
  };
}

export function updateCodexStatusFromTurnStart(
  status: CodexStatusSnapshot,
  threadId: string,
  response: TurnStartResponse,
): CodexStatusSnapshot {
  return {
    ...status,
    connected: true,
    threadId,
    turnId: response.turn.id,
    turnStatus: normalizeCodexStatusValue(response.turn.status) || "running",
    threadStatus: "running",
  };
}

export function updateCodexStatusFromTurnCompleted(
  status: CodexStatusSnapshot,
  completed: TurnCompletedParams,
): CodexStatusSnapshot {
  return {
    ...status,
    connected: true,
    threadId: stringValue(objectParam(completed), "threadId", "thread_id") || status.threadId,
    turnId: stringValue(objectParam(completed), "turnId", "turn_id") ||
      stringValue(objectParam(completed.turn), "id") ||
      status.turnId,
    turnStatus: statusValue(objectParam(completed), "status") ||
      statusValue(objectParam(completed.turn), "status") ||
      "completed",
    threadStatus: "idle",
  };
}

export function updateCodexStatusFromError(
  status: CodexStatusSnapshot,
  error: Error | string,
): CodexStatusSnapshot {
  return {
    ...status,
    connected: status.connected,
    turnStatus: "failed",
    lastNotice: error instanceof Error ? error.message : error,
  };
}

export function updateCodexStatusFromNotification(
  status: CodexStatusSnapshot,
  notification: JSONRPCNotification,
): CodexStatusSnapshot {
  const params = objectParam(notification.params);
  let next = { ...status, connected: true };

  if (notification.method === "thread/started") {
    next = {
      ...next,
      threadId: stringValue(params, "threadId", "thread_id") || threadField(params, "id"),
      threadStatus: statusValue(params, "status") || threadStatusField(params),
      model: stringValue(params, "model") || next.model,
      modelProvider: stringValue(params, "modelProvider", "model_provider") || next.modelProvider,
    };
  } else if (notification.method === "thread/status/changed") {
    next = {
      ...next,
      threadId: stringValue(params, "threadId", "thread_id") || threadField(params, "id") || next.threadId,
      threadStatus: statusValue(params, "status") || threadStatusField(params) || next.threadStatus,
    };
  } else if (notification.method === "turn/started") {
    next = {
      ...next,
      threadId: stringValue(params, "threadId", "thread_id") || next.threadId,
      turnId: stringValue(params, "turnId", "turn_id") || turnField(params, "id") || next.turnId,
      turnStatus: statusValue(params, "status") || turnStatusField(params) || "running",
    };
  } else if (notification.method === "turn/completed") {
    next = updateCodexStatusFromTurnCompleted(next, params as TurnCompletedParams);
  } else if (notification.method === "model/rerouted") {
    next = {
      ...next,
      model: stringValue(params, "model", "toModel", "to_model") || next.model,
      modelProvider: stringValue(params, "modelProvider", "model_provider", "toProvider", "to_provider") ||
        next.modelProvider,
      lastNotice: compactNotice("model rerouted", params),
    };
  } else if (notification.method === "thread/tokenUsage/updated") {
    next = {
      ...next,
      tokenUsage: tokenUsageSummary(params) || next.tokenUsage,
    };
  } else if (
    notification.method === "rateLimits/updated" ||
    notification.method === "account/rateLimits/updated"
  ) {
    const rateLimits = rateLimitStatus(params);
    next = {
      ...next,
      rateLimits: rateLimits.summary || next.rateLimits,
      fiveHourLimit: rateLimits.primary || next.fiveHourLimit,
      weeklyLimit: rateLimits.secondary || next.weeklyLimit,
    };
  } else if (isNoticeMethod(notification.method)) {
    next = {
      ...next,
      lastNotice: noticeText(notification.method, params),
    };
  }

  return next;
}

export function formatCodexStatusText(
  status: CodexStatusSnapshot,
  localStatus = "",
): string {
  const parts: string[] = [];
  if (localStatus) parts.push(localStatus);

  const codexState = normalizeCodexStatusValue(status.turnStatus) ||
    normalizeCodexStatusValue(status.threadStatus) ||
    (status.connected ? "connected" : "offline");
  parts.push(`codex ${codexState}`);
  if (status.model) parts.push(`model ${status.model}`);
  if (status.rateLimits) parts.push(status.rateLimits);
  if (status.tokenUsage) parts.push(status.tokenUsage);
  if (status.lastNotice && !localStatus.includes(status.lastNotice)) parts.push(status.lastNotice);

  return parts.filter(Boolean).join("   ");
}

export function normalizeCodexStatusValue(value: unknown): string | undefined {
  if (typeof value === "string") return normalizeCodexStatusText(value);
  if (typeof value !== "object" || value === null) return undefined;

  const record = value as Record<string, unknown>;
  for (const key of ["type", "status", "state"]) {
    const normalized = normalizeCodexStatusValue(record[key]);
    if (normalized) return normalized;
  }
  return undefined;
}

function normalizeCodexStatusText(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const key = trimmed.replace(/[-_\s]/g, "").toLowerCase();
  if (key === "inprogress" || key === "running" || key === "active" || key === "working") {
    return "running";
  }
  if (
    key === "completed" ||
    key === "complete" ||
    key === "success" ||
    key === "succeeded" ||
    key === "done"
  ) {
    return "completed";
  }
  if (key === "failed" || key === "failure" || key === "error") return "failed";
  if (key === "aborted" || key === "abort" || key === "cancelled" || key === "canceled") {
    return "aborted";
  }
  if (key === "idle" || key === "ready") return "idle";

  return trimmed;
}

function statusValue(params: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const normalized = normalizeCodexStatusValue(params[key]);
    if (normalized) return normalized;
  }
  return undefined;
}

function threadField(params: Record<string, unknown>, key: string): string | undefined {
  return stringValue(objectParam(params.thread), key);
}

function turnField(params: Record<string, unknown>, key: string): string | undefined {
  return stringValue(objectParam(params.turn), key);
}

function threadStatusField(params: Record<string, unknown>): string | undefined {
  return statusValue(objectParam(params.thread), "status");
}

function turnStatusField(params: Record<string, unknown>): string | undefined {
  return statusValue(objectParam(params.turn), "status");
}

function isNoticeMethod(method: string): boolean {
  return [
    "error",
    "warning",
    "configWarning",
    "guardianWarning",
    "deprecationNotice",
    "verification",
  ].includes(method);
}

function noticeText(method: string, params: Record<string, unknown>): string {
  const text = stringValue(params, "message", "error", "warning", "text");
  return text ? `${method}: ${text}` : method;
}

function compactNotice(label: string, params: Record<string, unknown>): string {
  const from = stringValue(params, "fromModel", "from_model", "from");
  const to = stringValue(params, "toModel", "to_model", "model", "to");
  if (from && to) return `${label}: ${from} -> ${to}`;
  if (to) return `${label}: ${to}`;
  return label;
}

function tokenUsageSummary(params: Record<string, unknown>): string {
  const usage = objectParam(params.tokenUsage || params.token_usage || params.usage || params);
  const input = numberValue(usage, "inputTokens", "input_tokens", "promptTokens", "prompt_tokens");
  const output = numberValue(usage, "outputTokens", "output_tokens", "completionTokens", "completion_tokens");
  const total = numberValue(usage, "totalTokens", "total_tokens");
  if (total !== undefined) return `${total} used`;
  if (input !== undefined || output !== undefined) return `${(input || 0) + (output || 0)} used`;
  return "";
}

function rateLimitSummary(params: Record<string, unknown>): string {
  const limit = objectParam(params.rateLimit || params.rate_limit || params);
  const remaining = numberValue(limit, "remaining", "requestsRemaining", "requests_remaining");
  const resetAt = stringValue(limit, "resetAt", "reset_at");
  if (remaining !== undefined && resetAt) return `rate ${remaining} reset ${resetAt}`;
  if (remaining !== undefined) return `rate ${remaining}`;
  const label = stringValue(limit, "label", "message", "status");
  return label ? `rate ${label}` : "";
}

function rateLimitStatus(params: Record<string, unknown>): {
  summary: string;
  primary?: string;
  secondary?: string;
} {
  const snapshot = objectParam(params.rateLimits || params.rate_limits || params);
  const primary = rateLimitWindowSummary(snapshot, "primary", "5h");
  const secondary = rateLimitWindowSummary(snapshot, "secondary", "weekly");
  const summary = [primary, secondary].filter(Boolean).join(" ") || rateLimitSummary(params);
  return { summary, primary, secondary };
}

function rateLimitWindowSummary(
  snapshot: Record<string, unknown>,
  key: "primary" | "secondary",
  fallbackLabel: string,
): string | undefined {
  const window = objectParam(snapshot[key]);
  const usedPercent = numberValue(window, "usedPercent", "used_percent");
  if (usedPercent === undefined) return undefined;
  const duration = numberValue(window, "windowDurationMins", "window_duration_mins");
  const label = duration === undefined ? fallbackLabel : rateLimitDurationLabel(duration);
  const remaining = Math.max(0, Math.min(100, 100 - usedPercent));
  return `${label} ${remaining.toFixed(0)}%`;
}

function rateLimitDurationLabel(minutes: number): string {
  const day = 24 * 60;
  const week = 7 * day;
  const month = 30 * day;
  const roundingBias = 3;
  if (minutes <= day + roundingBias) {
    return `${Math.max(1, Math.floor((minutes + roundingBias) / 60))}h`;
  }
  if (minutes <= week + roundingBias) return "weekly";
  if (minutes <= month + roundingBias) return "monthly";
  return "annual";
}

function stringConfigValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
