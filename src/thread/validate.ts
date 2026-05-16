import type { BranchOut, EventLine, PicoLine, RolloutLine } from "./types";

export const CURRENT_THREAD_VERSION = 3;

// ── Helpers ────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// ── Validation ─────────────────────────────────────────────

/**
 * Validate a raw JSON‑parsed object and return a typed PicoLine.
 * Throws on any structural violation.
 */
export function validatePicoLine(raw: unknown): PicoLine {
  if (!isRecord(raw)) throw new Error("Invalid PicoLine: expected an object");

  const type = raw.type;

  // ─ BranchOut ─
  if (type === "branch_out") {
    if (!isNonEmptyString(raw.id)) throw new Error("Invalid branch_out: missing or empty id");
    if (!isNonEmptyString(raw.parent)) throw new Error("Invalid branch_out: missing or empty parent");
    return raw as unknown as BranchOut;
  }

  // Every non‑branch line must have an id and timestamp
  if (!isNonEmptyString(raw.id)) throw new Error(`Invalid line: missing or empty id (type=${String(type)})`);
  if (typeof raw.timestamp !== "string") throw new Error(`Invalid line: timestamp must be a string (id=${raw.id})`);

  if (raw.parent !== undefined && typeof raw.parent !== "string") {
    throw new Error(`Invalid line: parent must be a string or absent (id=${raw.id})`);
  }

  // ─ EventLine ─
  if (type === "event_msg") {
    if (!isNonEmptyString(raw.parent)) throw new Error(`Invalid event_msg: parent required (id=${raw.id})`);
    return raw as unknown as EventLine;
  }

  // ─ RolloutLine (session_meta | response_item) ─
  if (type === "session_meta" || type === "response_item") {
    if (!isRecord(raw.payload)) {
      throw new Error(`Invalid RolloutLine (type=${String(type)}): payload must be a non‑null object (id=${raw.id})`);
    }
    return raw as unknown as RolloutLine;
  }

  throw new Error(`Unknown PicoLine type: ${String(type)} (id=${raw.id || "<no id>"})`);
}

// ── Backward‑compat validation for old‑format files ────────

/**
 * Validate an old-format thread header (type: "thread", version check).
 * Kept so `codex-threads.ts` import tool continues to compile.
 */
export function validatePicoThreadHeader(raw: unknown, path: string): Record<string, unknown> {
  if (!isRecord(raw)) throw new Error(`Invalid thread header in ${path}`);

  const id = raw.id;
  if (!isNonEmptyString(id)) throw new Error(`Invalid thread header id in ${path}`);
  if (typeof raw.createdAt !== "string") throw new Error(`Invalid thread header createdAt in ${path}`);
  if (typeof raw.cwd !== "string") throw new Error(`Invalid thread header cwd in ${path}`);
  if (!isRecord(raw.config)) throw new Error(`Invalid thread header config in ${path}`);

  return raw as Record<string, unknown>;
}
