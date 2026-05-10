const MAX_ARGUMENTS = 4;
const MAX_VALUE_LENGTH = 72;
const MAX_PATCH_FILES = 3;

type PatchOp = "A" | "M" | "D" | "R";

interface PatchChangeSummary {
  op: PatchOp;
  path: string;
  additions: number;
  deletions: number;
}

export function formatArgumentSummary(value: unknown): string {
  const normalized = normalizeJsonLike(value);
  if (normalized === undefined || normalized === null) return "";
  if (!isRecord(normalized)) return formatValue(normalized);

  const entries = Object.entries(normalized)
    .filter(([, item]) => item !== undefined && item !== null);
  if (entries.length === 0) return "";

  const visible = entries.slice(0, MAX_ARGUMENTS);
  const parts = visible.map(([key, item]) => `${key}=${formatValue(item)}`);
  const omitted = entries.length - visible.length;
  if (omitted > 0) parts.push(`+${omitted}`);
  return parts.join(" ");
}

export function formatToolArgumentSummary(toolName: string | undefined, value: unknown): string {
  if (isApplyPatchTool(toolName)) {
    const patch = patchTextFromValue(value);
    const summary = patch ? summarizePatchText(patch) : "";
    if (summary) return summary;
  }
  return formatArgumentSummary(value);
}

export function formatToolOutputSummary(value: unknown): string {
  const text = outputTextFromValue(value);
  const applyPatchSummary = summarizeApplyPatchOutputText(text);
  if (applyPatchSummary) return applyPatchSummary;
  const commandSummary = summarizeCommandOutputText(text);
  if (commandSummary !== undefined) return commandSummary;
  if (text) return text;
  return formatStructuredPreview(value);
}

export function formatCommandOutputSummary(value: unknown): string {
  const text = outputTextFromValue(value);
  const commandSummary = summarizeCommandOutputText(text);
  if (commandSummary !== undefined) return commandSummary;
  if (text) return text;
  return formatStructuredPreview(value);
}

export function formatStructuredPreview(value: unknown): string {
  const normalized = normalizeJsonLike(value);
  if (normalized === undefined || normalized === null) return "";
  if (typeof normalized === "string") return compactValue(normalized);
  if (isRecord(normalized)) return formatArgumentSummary(normalized);
  if (Array.isArray(normalized)) return formatArray(normalized);
  return String(normalized);
}

export function summarizeFileChange(diff?: string): string | undefined {
  if (!diff?.trim()) return undefined;

  let additions = 0;
  let deletions = 0;
  for (const line of diff.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      additions += 1;
    } else if (line.startsWith("-")) {
      deletions += 1;
    }
  }
  if (additions > 0 || deletions > 0) return `+${additions} -${deletions}`;
  return "changed";
}

export function normalizeJsonLike(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function summarizePatchText(text: string): string {
  const changes = patchChanges(text);
  if (changes.length === 0) return "";

  const visible = changes.slice(0, MAX_PATCH_FILES).map(formatPatchChange);
  const omitted = changes.length - visible.length;
  if (omitted > 0) visible.push(`+${omitted} files`);
  return visible.join(", ");
}

function patchChanges(text: string): PatchChangeSummary[] {
  const changes: PatchChangeSummary[] = [];
  let current: PatchChangeSummary | undefined;

  for (const line of text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    const header = line.match(/^\*\*\* (Add|Update|Delete) File: (.+)$/);
    if (header) {
      if (current) changes.push(current);
      current = {
        op: patchOp(header[1] || ""),
        path: header[2]?.trim() || "file",
        additions: 0,
        deletions: 0,
      };
      continue;
    }

    const move = line.match(/^\*\*\* Move to: (.+)$/);
    if (move && current) {
      current = {
        ...current,
        op: "R",
        path: `${current.path} -> ${move[1]?.trim() || "file"}`,
      };
      continue;
    }

    if (!current || line.startsWith("*** ") || line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    if (line.startsWith("+")) {
      current.additions += 1;
    } else if (line.startsWith("-")) {
      current.deletions += 1;
    }
  }

  if (current) changes.push(current);
  return changes;
}

function patchOp(value: string): PatchOp {
  switch (value) {
    case "Add":
      return "A";
    case "Delete":
      return "D";
    default:
      return "M";
  }
}

function formatPatchChange(change: PatchChangeSummary): string {
  const stats = [
    change.additions > 0 ? `+${change.additions}` : "",
    change.deletions > 0 ? `-${change.deletions}` : "",
  ].filter(Boolean);
  return [change.op, compactPath(change.path), ...stats].join(" ");
}

function summarizeApplyPatchOutputText(text: string): string | undefined {
  const normalized = text.trim();
  if (!normalized.startsWith("Success. Updated")) return undefined;

  const files = normalized
    .split(/\r?\n/)
    .map((line) => line.match(/^([AMDR])\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => `${match[1]} ${compactPath(match[2] || "file")}`);

  if (files.length === 0) return "Success. Updated files";

  const visible = files.slice(0, MAX_PATCH_FILES);
  const omitted = files.length - visible.length;
  if (omitted > 0) visible.push(`+${omitted} files`);
  return `Success. Updated ${visible.join(", ")}`;
}

function summarizeCommandOutputText(text: string): string | undefined {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const outputIndex = lines.findIndex((line) => line.trim() === "Output:");
  const exitCode = commandExitCode(lines);

  if (outputIndex >= 0) {
    const output = trimBlankLines(lines.slice(outputIndex + 1)).join("\n");
    if (exitCode && exitCode !== "0") {
      return output ? `exit ${exitCode}\n${output}` : `exit ${exitCode}`;
    }
    return output;
  }

  if (lines.some(isCommandWrapperMetadataLine)) {
    const output = trimBlankLines(lines.filter((line) => !isCommandWrapperMetadataLine(line))).join("\n");
    if (exitCode && exitCode !== "0" && !output.includes(`Process exited with code ${exitCode}`)) {
      return output ? `exit ${exitCode}\n${output}` : `exit ${exitCode}`;
    }
    return output;
  }

  return undefined;
}

function commandExitCode(lines: readonly string[]): string | undefined {
  for (const line of lines) {
    const match = line.match(/^Process exited with code (-?\d+)/);
    if (match) return match[1];
  }
  return undefined;
}

function isCommandWrapperMetadataLine(line: string): boolean {
  return (
    /^Chunk ID: /.test(line) ||
    /^Wall time: /.test(line) ||
    /^Process exited with code /.test(line) ||
    /^Original token count: /.test(line)
  );
}

function trimBlankLines(lines: readonly string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]?.trim() === "") start += 1;
  while (end > start && lines[end - 1]?.trim() === "") end -= 1;
  return lines.slice(start, end);
}

function patchTextFromValue(value: unknown): string {
  const normalized = normalizeJsonLike(value);
  if (typeof normalized === "string") return normalized;
  if (!isRecord(normalized)) return "";
  return firstString(normalized, ["patch", "diff", "input", "content", "text"]) || "";
}

function outputTextFromValue(value: unknown, depth = 0): string {
  if (depth > 6 || value === undefined || value === null) return "";
  const normalized = normalizeJsonLike(value);
  if (typeof normalized === "string") return normalized.trim();
  if (typeof normalized === "number" || typeof normalized === "boolean") return String(normalized);
  if (Array.isArray(normalized)) {
    return normalized.map((item) => outputTextFromValue(item, depth + 1)).filter(Boolean).join("");
  }
  if (!isRecord(normalized)) return "";

  const direct = firstString(normalized, [
    "output",
    "stdout",
    "stderr",
    "text",
    "output_text",
    "content",
    "summary",
    "message",
  ]);
  if (direct) return outputTextFromValue(direct, depth + 1);

  for (const key of ["body", "result", "items", "content", "output"]) {
    const nested = outputTextFromValue(normalized[key], depth + 1);
    if (nested) return nested;
  }
  return "";
}

function isApplyPatchTool(toolName: string | undefined): boolean {
  const normalized = toolName?.toLowerCase();
  return normalized === "apply_patch" || normalized?.endsWith(".apply_patch") || false;
}

function compactPath(value: string): string {
  const path = value.trim();
  if (path.includes(" -> ")) {
    return path.split(" -> ").map(compactPath).join(" -> ");
  }
  const cwd = process.cwd().replace(/\/$/, "");
  if (path.startsWith(`${cwd}/`)) return path.slice(cwd.length + 1);
  return path;
}

function formatValue(value: unknown): string {
  const normalized = normalizeJsonLike(value);
  if (normalized === undefined || normalized === null) return "";
  if (typeof normalized === "string") return compactValue(normalized);
  if (typeof normalized === "number" || typeof normalized === "boolean") return String(normalized);
  if (Array.isArray(normalized)) return formatArray(normalized);
  if (isRecord(normalized)) {
    const keys = Object.keys(normalized);
    return keys.length === 0 ? "{}" : `{${keys.length} fields}`;
  }
  return compactValue(String(normalized));
}

function formatArray(value: readonly unknown[]): string {
  if (value.length === 0) return "[]";
  if (value.every((item) => typeof normalizeJsonLike(item) !== "object")) {
    const visible = value.slice(0, 3).map(formatValue);
    const omitted = value.length - visible.length;
    return `[${visible.join(", ")}${omitted > 0 ? `, +${omitted}` : ""}]`;
  }
  return `[${value.length} items]`;
}

function compactValue(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= MAX_VALUE_LENGTH) return compact;
  return `${compact.slice(0, MAX_VALUE_LENGTH - 3)}...`;
}

function firstString(
  item: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
