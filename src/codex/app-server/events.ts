export interface TurnCompletedParams {
  threadId?: string;
  thread_id?: string;
  turnId?: string;
  turn_id?: string;
  turn?: { id?: string; status?: string };
  status?: string;
  error?: unknown;
  [key: string]: unknown;
}

export function messageThreadId(params: unknown): string | undefined {
  const value = objectParam(params);
  return stringValue(value, "threadId", "thread_id") || stringValue(objectParam(value.thread), "id");
}

export function messageTurnId(params: unknown): string | undefined {
  const value = objectParam(params);
  return stringValue(value, "turnId", "turn_id") || stringValue(objectParam(value.turn), "id");
}

export function objectParam(params: unknown): Record<string, unknown> {
  return typeof params === "object" && params !== null ? params as Record<string, unknown> : {};
}

export function stringValue(item: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

export function numberValue(item: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number") return value;
  }
  return undefined;
}
