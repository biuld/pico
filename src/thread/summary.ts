import type { PicoThreadInfo, SessionMeta } from "./types";

// ── Helpers ────────────────────────────────────────────────

function previewText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function extractTextFromUserPayload(payload: Record<string, unknown>): string {
  const content = payload.content;
  if (!Array.isArray(content)) return "";
  const parts = content
    .map((part) => {
      const p = asRecord(part);
      return typeof p?.text === "string" ? p.text : "";
    })
    .filter(Boolean);
  return parts.length > 0 ? previewText(parts.join("\n")) : "";
}

function extractFirstUserTextNew(lines: readonly unknown[]): string {
  for (let i = 1; i < lines.length; i++) {
    const raw = asRecord(lines[i]);
    if (!raw || raw.type !== "response_item") continue;
    const payload = asRecord(raw.payload);
    if (!payload || payload.role !== "user") continue;
    const text = extractTextFromUserPayload(payload);
    if (text) return text;
  }
  return "";
}

function extractFirstUserTextOld(lines: readonly unknown[]): string {
  for (let i = 1; i < lines.length; i++) {
    const raw = asRecord(lines[i]);
    if (!raw) continue;
    const item = asRecord(raw.item);
    if (!item || item.type !== "response_item") continue;
    const payload = asRecord(item.payload);
    if (!payload || payload.role !== "user") continue;
    const text = extractTextFromUserPayload(payload);
    if (text) return text;
  }
  return "";
}

// ── Summary ────────────────────────────────────────────────

/**
 * Read raw JSONL lines and return a summary suitable for thread listing.
 * Handles the new session_meta-first format and the old header-first format.
 */
export function summarizeThreadJsonl(lines: readonly unknown[]): PicoThreadInfo | undefined {
  if (lines.length === 0) return undefined;

  const first = asRecord(lines[0]);
  if (!first) return undefined;

  // ── New format: first line is session_meta RolloutLine ──
  if (first.type === "session_meta") {
    const metaRaw = asRecord(first.payload);
    if (!metaRaw || !isNonEmptyString(metaRaw.id)) return undefined;

    const meta = metaRaw as unknown as SessionMeta;
    const id = meta.id;
    const cwd = meta.cwd || "";
    const createdAt = meta.createdAt || "";
    let updatedAt = typeof first.timestamp === "string" ? first.timestamp : createdAt;
    let preview = "";
    let turnCount = 0;
    let responseItemCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const raw = asRecord(lines[i]);
      if (!raw) continue;

      if (typeof raw.timestamp === "string") {
        updatedAt = raw.timestamp;
      }

      if (raw.type === "response_item") {
        responseItemCount++;
        const payload = asRecord(raw.payload);
        if (payload && payload.role === "user") {
          turnCount++;
          if (!preview) preview = extractFirstUserTextNew(lines);
        }
      }
    }

    const last = asRecord(lines[lines.length - 1]);
    const leafId = last && isNonEmptyString(last.id) ? last.id : id;

    return { id, leafId, cwd, createdAt, updatedAt: updatedAt || createdAt, preview, turnCount, responseItemCount };
  }

  // ── Old format: first line is type: "thread" header ──
  if (first.type === "thread") {
    if (!isNonEmptyString(first.id)) return undefined;
    const id = first.id;
    const cwd = isNonEmptyString(first.cwd) ? first.cwd : "";
    const createdAt = isNonEmptyString(first.createdAt) ? first.createdAt : "";
    let updatedAt = createdAt;
    let preview = "";
    let turnCount = 0;
    let responseItemCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const raw = asRecord(lines[i]);
      if (!raw) continue;

      if (typeof raw.timestamp === "string") {
        updatedAt = raw.timestamp;
      }

      const item = asRecord(raw.item);
      if (!item) continue;

      if (item.type === "response_item") {
        responseItemCount++;
        const payload = asRecord(item.payload);
        if (payload && payload.role === "user") {
          turnCount++;
          if (!preview) preview = extractFirstUserTextOld(lines);
        }
      }
    }

    const last = asRecord(lines[lines.length - 1]);
    const leafId = last && isNonEmptyString(last.id) ? last.id : id;

    return { id, leafId, cwd, createdAt, updatedAt: updatedAt || createdAt, preview, turnCount, responseItemCount };
  }

  return undefined;
}
